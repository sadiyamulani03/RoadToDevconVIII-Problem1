// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Connect Four — asynchronous, turn-based, fully onchain
/// @notice A 7x6 Connect Four game that waits for each player. Every rule —
///         legal moves, turn order, win/draw detection and the inactivity
///         forfeit — is enforced by this contract. Nothing about the game is
///         trusted from the client: no caller-supplied winner, board or actor
///         is ever accepted as authoritative.
///
///         Board indexing: cell = row * 7 + column, row 0 is the BOTTOM row,
///         column 0 is the LEFTMOST column. Pieces fall to the lowest empty
///         row of the chosen column.
///
///         Timeout policy: each game stores `lastMoveTimestamp`, refreshed on
///         create, join and every successful move. If the game is still
///         `Active` and `block.timestamp > lastMoveTimestamp + TIMEOUT`
///         (strictly greater), the player who is NOT on turn may claim a
///         forfeit and win the game. TIMEOUT is a fixed 7 days.
contract ConnectFour {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint8 public constant WIDTH = 7;
    uint8 public constant HEIGHT = 6;
    uint8 public constant CELLS = 42;
    /// @notice Inactivity timeout, measured from the last successful state
    ///         change (game creation, join, or move). A claim is only valid
    ///         when block.timestamp is STRICTLY greater than
    ///         lastMoveTimestamp + TIMEOUT.
    uint256 public constant TIMEOUT = 7 days;

    /// @dev All 42 cell bits set — used for the draw (full board) check.
    uint64 private constant FULL_BOARD = uint64((1 << 42) - 1);

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Explicit game lifecycle. `Won`, `Draw` and `Forfeited` are all
    ///         finished states; a finished game never accepts another move.
    enum Status {
        WaitingForOpponent, // created, no opponent yet
        Active, // two players, moves allowed
        Won, // four connected pieces
        Draw, // board full, no winner
        Forfeited // inactivity timeout claimed
    }

    struct Game {
        address creator;
        address opponent;
        address currentTurn; // whose move it is while Active
        address winner; // 0x0 unless Won/Forfeited
        Status status;
        uint64 lastMoveTimestamp;
        uint64 playerOnePieces; // bit per cell (creator's pieces)
        uint64 playerTwoPieces; // bit per cell (opponent's pieces)
    }

    /// @notice Flattened view returned by getGame(); includes the derived
    ///         forfeit deadline so the frontend can render a countdown
    ///         without recomputing it.
    struct GameView {
        address creator;
        address opponent;
        address currentTurn;
        address winner;
        Status status;
        uint64 lastMoveTimestamp;
        uint64 timeoutDeadline;
        uint64 playerOnePieces;
        uint64 playerTwoPieces;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    uint256 public gameCount;
    mapping(uint256 => Game) private games;

    // ---------------------------------------------------------------------
    // Events (frontend + indexers reconstruct everything from these)
    // ---------------------------------------------------------------------

    event GameCreated(uint256 indexed gameId, address indexed creator);
    event GameJoined(uint256 indexed gameId, address indexed opponent);
    event MoveMade(uint256 indexed gameId, address indexed player, uint8 column, uint8 row);
    event GameWon(uint256 indexed gameId, address indexed winner);
    event GameDrawn(uint256 indexed gameId);
    event GameForfeited(uint256 indexed gameId, address indexed winner);

    // ---------------------------------------------------------------------
    // Custom errors (cheaper than revert strings)
    // ---------------------------------------------------------------------

    error GameNotFound();
    error NotJoinable();
    error CannotJoinOwnGame();
    error GameNotActive();
    error NotYourTurn();
    error NotAPlayer();
    error InvalidColumn();
    error ColumnFull();
    error TimeoutNotReached();

    // ---------------------------------------------------------------------
    // Modifiers / helpers
    // ---------------------------------------------------------------------

    modifier onlyExistingGame(uint256 gameId) {
        _checkExists(gameId);
        _;
    }

    function _checkExists(uint256 gameId) private view {
        if (gameId == 0 || gameId > gameCount) revert GameNotFound();
    }

    /// @dev Records the current time as the game's activity marker.
    ///      block.timestamp fits in uint64 until the year ~584 billion.
    function _touch(Game storage g) private {
        // forge-lint: disable-next-line(unsafe-typecast)
        g.lastMoveTimestamp = uint64(block.timestamp);
    }

    /// @dev True while the game accepts moves.
    function _requireActive(Game storage g) private view {
        if (g.status != Status.Active) revert GameNotActive();
    }

    /// @dev Lowest empty row in `column`, or revert if the column is full.
    function _lowestEmptyRow(Game storage g, uint8 column) private view returns (uint8 row) {
        uint64 occupancy = g.playerOnePieces | g.playerTwoPieces;
        for (uint8 r = 0; r < HEIGHT; r++) {
            uint256 bit = uint256(r) * WIDTH + column;
            if (((occupancy >> bit) & 1) == 0) return r;
        }
        revert ColumnFull();
    }

    // ---------------------------------------------------------------------
    // Game lifecycle
    // ---------------------------------------------------------------------

    /// @notice Create a new game. msg.sender becomes the creator and the
    ///         first player to move (the turn is only exercised once the
    ///         game is Active).
    /// @return gameId The id of the newly created game (ids start at 1).
    function createGame() external returns (uint256 gameId) {
        gameId = ++gameCount;
        Game storage g = games[gameId];
        g.creator = msg.sender;
        g.currentTurn = msg.sender;
        g.status = Status.WaitingForOpponent;
        _touch(g);
        emit GameCreated(gameId, msg.sender);
    }

    /// @notice Join an open game as the second player. The game becomes
    ///         Active and the creator moves first.
    function joinGame(uint256 gameId) external onlyExistingGame(gameId) {
        Game storage g = games[gameId];
        if (g.status != Status.WaitingForOpponent) revert NotJoinable();
        if (msg.sender == g.creator) revert CannotJoinOwnGame();

        g.opponent = msg.sender;
        g.status = Status.Active;
        g.currentTurn = g.creator;
        _touch(g);

        emit GameJoined(gameId, msg.sender);
    }

    /// @notice Place a piece in `column`. The piece falls to the lowest
    ///         empty row. Only the current player of an Active game may
    ///         move, columns must be 0..6 and non-full.
    /// @param column Target column, 0 (left) to 6 (right).
    function makeMove(uint256 gameId, uint8 column) external onlyExistingGame(gameId) {
        Game storage g = games[gameId];
        _requireActive(g);
        if (msg.sender != g.currentTurn) revert NotYourTurn();
        if (column >= WIDTH) revert InvalidColumn();

        uint8 row = _lowestEmptyRow(g, column);
        uint256 bit = uint256(row) * WIDTH + column;

        // Write the piece for whichever player is on turn. The creator is
        // always player one; the opponent is always player two.
        // bit < 42 by construction, so the uint64 cast cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 pieceBit = uint64(uint256(1) << bit);
        if (msg.sender == g.creator) {
            g.playerOnePieces |= pieceBit;
        } else {
            g.playerTwoPieces |= pieceBit;
        }
        _touch(g);

        emit MoveMade(gameId, msg.sender, column, row);

        uint64 moverMask = msg.sender == g.creator ? g.playerOnePieces : g.playerTwoPieces;

        // Winner takes precedence: a winning move that also fills the board
        // still records Won, not Draw.
        if (_hasWon(moverMask, bit)) {
            g.status = Status.Won;
            g.winner = msg.sender;
            emit GameWon(gameId, msg.sender);
            return;
        }

        uint64 occupancy = g.playerOnePieces | g.playerTwoPieces;
        if (occupancy == FULL_BOARD) {
            g.status = Status.Draw;
            emit GameDrawn(gameId);
            return;
        }

        g.currentTurn = msg.sender == g.creator ? g.opponent : g.creator;
    }

    /// @notice Claim a forfeit after the inactivity deadline. Only the
    ///         player who is NOT on turn may claim, the game must still be
    ///         Active, and the deadline must be strictly exceeded.
    function claimTimeout(uint256 gameId) external onlyExistingGame(gameId) {
        Game storage g = games[gameId];
        _requireActive(g);
        // Only the two participants may claim, and never the player whose
        // move is pending.
        if (msg.sender != g.creator && msg.sender != g.opponent) revert NotAPlayer();
        if (msg.sender == g.currentTurn) revert NotYourTurn();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= uint256(g.lastMoveTimestamp) + TIMEOUT) revert TimeoutNotReached();

        address winner = g.currentTurn == g.creator ? g.opponent : g.creator;
        g.status = Status.Forfeited;
        g.winner = winner;

        emit GameForfeited(gameId, winner);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    /// @notice Full authoritative state of a game, including the derived
    ///         forfeit deadline (= lastMoveTimestamp + TIMEOUT).
    function getGame(uint256 gameId)
        external
        view
        onlyExistingGame(gameId)
        returns (GameView memory)
    {
        Game storage g = games[gameId];
        return GameView({
            creator: g.creator,
            opponent: g.opponent,
            currentTurn: g.currentTurn,
            winner: g.winner,
            status: g.status,
            lastMoveTimestamp: g.lastMoveTimestamp,
            // forge-lint: disable-next-line(unsafe-typecast)
            timeoutDeadline: uint64(uint256(g.lastMoveTimestamp) + TIMEOUT),
            playerOnePieces: g.playerOnePieces,
            playerTwoPieces: g.playerTwoPieces
        });
    }

    /// @notice The 42-cell board, row-major from the TOP-left for direct
    ///         rendering: index = row * 7 + column with row 0 = top row.
    /// @return board 0 = empty, 1 = creator piece, 2 = opponent piece.
    function getBoard(uint256 gameId)
        external
        view
        onlyExistingGame(gameId)
        returns (uint8[42] memory board)
    {
        Game storage g = games[gameId];
        for (uint8 r = 0; r < HEIGHT; r++) {
            uint8 storageRow = HEIGHT - 1 - r; // storage row 0 is bottom
            for (uint8 c = 0; c < WIDTH; c++) {
                uint256 bit = uint256(storageRow) * WIDTH + c;
                if (((g.playerOnePieces >> bit) & 1) == 1) {
                    board[uint256(r) * WIDTH + c] = 1;
                } else if (((g.playerTwoPieces >> bit) & 1) == 1) {
                    board[uint256(r) * WIDTH + c] = 2;
                }
            }
        }
    }

    /// @notice How many games have been created (ids are 1..gameCount).
    function getGameCount() external view returns (uint256) {
        return gameCount;
    }

    /// @notice Convenience existence check for UIs.
    function gameExists(uint256 gameId) public view returns (bool) {
        return gameId != 0 && gameId <= gameCount;
    }

    // ---------------------------------------------------------------------
    // Win detection — evaluated exclusively against the stored board
    // ---------------------------------------------------------------------

    /// @notice Four-or-more connected pieces through `origin` in any of the
    ///         four directions (horizontal, vertical, both diagonals).
    function _hasWon(uint64 mask, uint256 origin) internal pure returns (bool) {
        // Defensive: the caller always just wrote this cell, but an unset
        // origin must never count as a connected piece.
        if (((mask >> origin) & 1) == 0) return false;
        // (dCol, dRow) — one positive representative per axis so each line
        // is evaluated exactly once; counting happens both ways along it.
        return _line(mask, origin, 1, 0) // horizontal
            || _line(mask, origin, 0, 1) // vertical
            || _line(mask, origin, 1, 1) // diagonal bottom-left -> top-right
            || _line(mask, origin, 1, -1); // diagonal top-left -> bottom-right
    }

    /// @dev Counts consecutive set bits through `origin` along a direction
    ///      and its opposite; true when at least 4 are connected.
    function _line(uint64 mask, uint256 origin, int256 dCol, int256 dRow)
        private
        pure
        returns (bool)
    {
        uint256 connected =
            1 + _walk(mask, origin, dCol, dRow) + _walk(mask, origin, -dCol, -dRow);
        return connected >= 4;
    }

    /// @dev Steps at most 3 cells from `origin` along (dCol, dRow), counting
    ///      consecutive set bits until the edge or an empty cell.
    function _walk(uint64 mask, uint256 origin, int256 dCol, int256 dRow)
        private
        pure
        returns (uint256 steps)
    {
        // Origin is always a valid cell index (< 42), so both casts are safe.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 col = int256(origin % WIDTH);
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 row = int256(origin / WIDTH);
        for (uint256 i = 0; i < 3; i++) {
            col += dCol;
            row += dRow;
            if (col < 0 || col > 6 || row < 0 || row > 5) return steps;
            // Bounds checked above, so the casts cannot truncate.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint256 bit = uint256(row) * WIDTH + uint256(col);
            if (((mask >> bit) & 1) == 0) return steps;
            steps++;
        }
    }
}

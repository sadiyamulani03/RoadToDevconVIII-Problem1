// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ConnectFour} from "../src/ConnectFour.sol";

contract ConnectFourTest is Test {
    ConnectFour internal cf;

    address internal alice; // creator / player one
    address internal bob; // opponent / player two
    address internal carol; // bystander
    address internal dave; // second game's player

    // Status enum mirrors (see ConnectFour.Status)
    uint8 internal constant WAITING = 0;
    uint8 internal constant ACTIVE = 1;
    uint8 internal constant WON = 2;
    uint8 internal constant DRAW = 3;
    uint8 internal constant FORFEITED = 4;

    // Redeclared for expectEmit topic matching (identical signatures).
    event GameCreated(uint256 indexed gameId, address indexed creator);
    event GameJoined(uint256 indexed gameId, address indexed opponent);
    event MoveMade(uint256 indexed gameId, address indexed player, uint8 column, uint8 row);
    event GameWon(uint256 indexed gameId, address indexed winner);
    event GameDrawn(uint256 indexed gameId);
    event GameForfeited(uint256 indexed gameId, address indexed winner);

    function setUp() public {
        cf = new ConnectFour();
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        dave = makeAddr("dave");
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _create() internal returns (uint256 id) {
        vm.prank(alice);
        id = cf.createGame();
    }

    function _createActive() internal returns (uint256 id) {
        id = _create();
        vm.prank(bob);
        cf.joinGame(id);
    }

    function _view(uint256 id) internal view returns (ConnectFour.GameView memory) {
        return cf.getGame(id);
    }

    function _move(address who, uint256 id, uint8 col) internal {
        vm.prank(who);
        cf.makeMove(id, col);
    }

    /// @dev Plays a fixed column sequence, alternating alice (creator,
    ///      moves first) and bob, exactly as the contract enforces.
    function _playSequence(uint256 id, uint8[42] memory cols, uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            address p = i % 2 == 0 ? alice : bob;
            vm.prank(p);
            cf.makeMove(id, cols[i]);
        }
    }

    // ------------------------------------------------------------------
    // A. Game creation
    // ------------------------------------------------------------------

    function test_CreateGame_InitializesState() public {
        uint256 id = _create();
        assertEq(id, 1, "first game id");
        assertEq(cf.gameCount(), 1);

        ConnectFour.GameView memory g = _view(id);
        assertEq(g.creator, alice, "creator");
        assertEq(g.opponent, address(0), "no opponent yet");
        assertEq(g.currentTurn, alice, "creator's first turn");
        assertEq(g.winner, address(0), "no winner");
        assertEq(uint8(g.status), WAITING, "waiting for opponent");
        assertEq(g.lastMoveTimestamp, uint64(block.timestamp), "creation time");
        assertEq(g.timeoutDeadline, uint64(block.timestamp + cf.TIMEOUT()), "deadline");
        assertEq(g.playerOnePieces, 0, "empty board");
        assertEq(g.playerTwoPieces, 0, "empty board");
        assertTrue(cf.gameExists(id));
        assertFalse(cf.gameExists(id + 1));
        assertFalse(cf.gameExists(0));
    }

    function test_CreateGame_EmitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit GameCreated(1, alice);
        _create();
    }

    function test_CreateGame_IdsIncrement() public {
        uint256 a = _create();
        vm.prank(bob);
        uint256 b = cf.createGame();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(cf.getGameCount(), 2);
    }

    // ------------------------------------------------------------------
    // B, C, D, E. Joining
    // ------------------------------------------------------------------

    function test_JoinGame_ActivatesAndCreatorStarts() public {
        uint256 id = _create();
        uint256 joinedAt = block.timestamp + 100;
        vm.warp(joinedAt);

        vm.prank(bob);
        cf.joinGame(id);

        ConnectFour.GameView memory g = _view(id);
        assertEq(g.opponent, bob, "opponent registered");
        assertEq(uint8(g.status), ACTIVE, "game active");
        assertEq(g.currentTurn, alice, "creator plays first");
        assertEq(g.lastMoveTimestamp, uint64(joinedAt), "join refreshes activity time");
        assertEq(g.winner, address(0));
    }

    function test_JoinGame_EmitsEvent() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, false);
        emit GameJoined(id, bob);
        vm.prank(bob);
        cf.joinGame(id);
    }

    function test_JoinGame_CreatorCannotJoinOwnGame() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert(ConnectFour.CannotJoinOwnGame.selector);
        cf.joinGame(id);
    }

    function test_JoinGame_ThirdPartyCannotJoinOccupiedGame() public {
        uint256 id = _create();
        vm.prank(bob);
        cf.joinGame(id);

        vm.prank(carol);
        vm.expectRevert(ConnectFour.NotJoinable.selector);
        cf.joinGame(id);

        // And the still-Waiting game can only be taken by one opponent.
        uint256 id2 = _create();
        vm.prank(bob);
        cf.joinGame(id2);
        vm.prank(carol);
        vm.expectRevert(ConnectFour.NotJoinable.selector);
        cf.joinGame(id2);
    }

    function test_JoinGame_NonexistentReverts() public {
        vm.prank(bob);
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.joinGame(1); // no games yet

        _create();
        vm.prank(bob);
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.joinGame(99);
    }

    function test_GetGame_NonexistentReverts() public {
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.getGame(0);
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.getGame(7);
    }

    // ------------------------------------------------------------------
    // F, G. Turn enforcement
    // ------------------------------------------------------------------

    function test_MakeMove_CorrectPlayerSucceeds() public {
        uint256 id = _createActive();
        _move(alice, id, 3);

        uint8[42] memory board = cf.getBoard(id);
        assertEq(board[38], 1, "creator piece at bottom of column 3");
        ConnectFour.GameView memory g = _view(id);
        assertEq(g.currentTurn, bob, "turn passes to opponent");
    }

    function test_MakeMove_RevertsWhenNotYourTurn() public {
        uint256 id = _createActive();

        // Bob is not on turn before any move.
        vm.prank(bob);
        vm.expectRevert(ConnectFour.NotYourTurn.selector);
        cf.makeMove(id, 0);

        _move(alice, id, 0);

        // Now it is Bob's turn, so Alice may not move.
        vm.prank(alice);
        vm.expectRevert(ConnectFour.NotYourTurn.selector);
        cf.makeMove(id, 1);
    }

    function test_MakeMove_BystanderCannotMove() public {
        uint256 id = _createActive();
        vm.prank(carol);
        vm.expectRevert(ConnectFour.NotYourTurn.selector);
        cf.makeMove(id, 0);
    }

    // ------------------------------------------------------------------
    // H, I. Illegal placement
    // ------------------------------------------------------------------

    function test_MakeMove_ColumnOutOfRangeReverts() public {
        uint256 id = _createActive();

        vm.prank(alice);
        vm.expectRevert(ConnectFour.InvalidColumn.selector);
        cf.makeMove(id, 7);

        vm.prank(alice);
        vm.expectRevert(ConnectFour.InvalidColumn.selector);
        cf.makeMove(id, 255);

        // "Negative" column cast to uint8 is 255 -> also rejected.
        vm.prank(alice);
        vm.expectRevert(ConnectFour.InvalidColumn.selector);
        cf.makeMove(id, uint8(int8(-1)));

        // Board untouched, still Alice's turn.
        ConnectFour.GameView memory g = _view(id);
        assertEq(g.currentTurn, alice);
        assertEq(g.playerOnePieces, 0);
    }

    function test_MakeMove_FullColumnReverts() public {
        uint256 id = _createActive();

        // Six alternating pieces fill column 0 with no winner possible.
        _move(alice, id, 0);
        _move(bob, id, 0);
        _move(alice, id, 0);
        _move(bob, id, 0);
        _move(alice, id, 0);
        _move(bob, id, 0);

        // It is Alice's turn and column 0 is full.
        vm.prank(alice);
        vm.expectRevert(ConnectFour.ColumnFull.selector);
        cf.makeMove(id, 0);

        // Neighbouring column still accepts pieces.
        _move(alice, id, 1);
        uint8[42] memory board = cf.getBoard(id);
        assertEq(board[36], 1, "column 1 bottom row");
        assertEq(board[29], 0, "column 1 second row empty");
    }

    function test_MakeMove_NonexistentGameReverts() public {
        vm.prank(alice);
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.makeMove(1, 0);
        vm.prank(alice);
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.makeMove(0, 0);
    }

    function test_MakeMove_BeforeJoinReverts() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.makeMove(id, 0);
    }

    // ------------------------------------------------------------------
    // J. Pieces fall to the lowest available row
    // ------------------------------------------------------------------

    function test_MakeMove_PiecesFallToLowestRow() public {
        uint256 id = _createActive();

        _move(alice, id, 0);
        uint8[42] memory board = cf.getBoard(id);
        assertEq(board[35], 1, "alice bottom row");

        _move(bob, id, 0);
        board = cf.getBoard(id);
        assertEq(board[28], 2, "bob stacks on top");
        assertEq(board[35], 1, "alice piece still below");

        _move(alice, id, 0);
        board = cf.getBoard(id);
        assertEq(board[21], 1, "alice on third level");

        _move(bob, id, 6);
        board = cf.getBoard(id);
        assertEq(board[41], 2, "far column bottom row");
        assertEq(board[34], 0, "nothing floating");
    }

    // ------------------------------------------------------------------
    // K, L, M. Wins in every direction
    // ------------------------------------------------------------------

    function test_Win_Horizontal() public {
        uint256 id = _createActive();

        // Alice: 0,1,2,3 along the bottom row; Bob wastes in column 6.
        _move(alice, id, 0);
        _move(bob, id, 6);
        _move(alice, id, 1);
        _move(bob, id, 6);
        _move(alice, id, 2);
        _move(bob, id, 6);

        vm.expectEmit(true, true, false, false);
        emit MoveMade(id, alice, 3, 0);
        vm.expectEmit(true, true, false, false);
        emit GameWon(id, alice);
        _move(alice, id, 3);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), WON);
        assertEq(g.winner, alice);
    }

    function test_Win_Vertical() public {
        uint256 id = _createActive();

        _move(alice, id, 0);
        _move(bob, id, 1);
        _move(alice, id, 0);
        _move(bob, id, 1);
        _move(alice, id, 0);
        _move(bob, id, 1);
        _move(alice, id, 0);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), WON);
        assertEq(g.winner, alice);
    }

    function test_Win_DiagonalBottomLeftToTopRight() public {
        uint256 id = _createActive();

        // Builds the diagonal (0,0) (1,1) (2,2) (3,3) [row, col] for Alice.
        _move(alice, id, 0); // a (0,0)
        _move(bob, id, 1); // b (0,1)
        _move(alice, id, 1); // a (1,1)
        _move(bob, id, 2); // b (0,2)
        _move(alice, id, 6); // a (0,6) filler
        _move(bob, id, 2); // b (1,2)
        _move(alice, id, 2); // a (2,2)
        _move(bob, id, 3); // b (0,3)
        _move(alice, id, 6); // a (1,6) filler
        _move(bob, id, 3); // b (1,3)
        _move(alice, id, 5); // a (0,5) filler
        _move(bob, id, 3); // b (2,3)

        vm.expectEmit(true, true, false, false);
        emit GameWon(id, alice);
        _move(alice, id, 3); // a (3,3) completes the diagonal

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), WON);
        assertEq(g.winner, alice);
    }

    function test_Win_DiagonalTopLeftToBottomRight() public {
        uint256 id = _createActive();

        // Builds the diagonal (0,3) (1,2) (2,1) (3,0) [row, col] for Alice.
        _move(alice, id, 3); // a (0,3)
        _move(bob, id, 2); // b (0,2)
        _move(alice, id, 2); // a (1,2)
        _move(bob, id, 1); // b (0,1)
        _move(alice, id, 6); // a (0,6) filler
        _move(bob, id, 1); // b (1,1)
        _move(alice, id, 1); // a (2,1)
        _move(bob, id, 0); // b (0,0)
        _move(alice, id, 6); // a (1,6) filler
        _move(bob, id, 0); // b (1,0)
        _move(alice, id, 5); // a (0,5) filler
        _move(bob, id, 0); // b (2,0)

        vm.expectEmit(true, true, false, false);
        emit GameWon(id, alice);
        _move(alice, id, 0); // a (3,0) completes the diagonal

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), WON);
        assertEq(g.winner, alice);
    }

    // ------------------------------------------------------------------
    // N. Non-winning moves
    // ------------------------------------------------------------------

    function test_NonWinningMove_NoWinnerDeclared() public {
        uint256 id = _createActive();

        // Alice gets three in a row; Bob's responses keep the board alive.
        _move(alice, id, 0);
        _move(bob, id, 3);
        _move(alice, id, 1);
        _move(bob, id, 4);
        _move(alice, id, 2); // three in a row for alice, but only three

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), ACTIVE, "still active");
        assertEq(g.winner, address(0), "no winner");
        assertEq(g.currentTurn, bob, "turn passed on");

        // Bob plays elsewhere; still no winner anywhere.
        _move(bob, id, 6);
        g = _view(id);
        assertEq(uint8(g.status), ACTIVE);
        assertEq(g.winner, address(0));
    }

    // ------------------------------------------------------------------
    // O. No moves after a win
    // ------------------------------------------------------------------

    function test_NoMoveAfterWin() public {
        uint256 id = _createActive();
        _move(alice, id, 0);
        _move(bob, id, 6);
        _move(alice, id, 1);
        _move(bob, id, 6);
        _move(alice, id, 2);
        _move(bob, id, 6);
        _move(alice, id, 3); // alice wins

        vm.prank(alice);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.makeMove(id, 4);

        vm.prank(bob);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.makeMove(id, 4);
    }

    // ------------------------------------------------------------------
    // P, X. Draws
    // ------------------------------------------------------------------

    function test_MakeMove_GameEndsInDrawOnFullBoard() public {
        uint256 id = _createActive();

        // Verified full-board draw sequence generated by
        // scripts/generate-full-board-games.mjs and independently checked
        // (42 plies, no 4-in-a-row for either player at any point).
        uint8[42] memory seq = [
            0,
            5,
            6,
            0,
            1,
            1,
            0,
            6,
            3,
            3,
            3,
            3,
            0,
            0,
            3,
            0,
            5,
            2,
            5,
            1,
            5,
            4,
            2,
            2,
            2,
            6,
            6,
            3,
            6,
            6,
            1,
            1,
            1,
            2,
            2,
            5,
            5,
            4,
            4,
            4,
            4,
            4
        ];

        vm.recordLogs();
        _playSequence(id, seq, 41);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), ACTIVE, "41 plies: still active");

        // Final move fills the board and must end the game as a draw.
        vm.expectEmit(true, false, false, false);
        emit GameDrawn(id);
        _move(bob, id, seq[41]);

        g = _view(id);
        assertEq(uint8(g.status), DRAW, "board full -> draw");
        assertEq(g.winner, address(0), "draw has no winner");

        uint8[42] memory board = cf.getBoard(id);
        for (uint256 i = 0; i < 42; i++) {
            assertTrue(board[i] != 0, "every cell filled");
        }

        // No moves after the draw.
        vm.prank(alice);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.makeMove(id, 0);
    }

    // ------------------------------------------------------------------
    // Y. Winning final move takes precedence over draw
    // ------------------------------------------------------------------

    function test_WinningFinalMove_BeatsDraw() public {
        uint256 id = _createActive();

        // Verified sequence generated by scripts/generate-full-board-games.mjs
        // and independently checked: no win exists after any of the first 41
        // plies; ply 42 fills the board AND completes a four-in-a-row for
        // Bob (the second player).
        uint8[42] memory seq = [
            6,
            5,
            2,
            4,
            5,
            0,
            3,
            1,
            0,
            1,
            0,
            4,
            0,
            1,
            1,
            5,
            6,
            4,
            3,
            3,
            4,
            3,
            6,
            2,
            1,
            0,
            3,
            0,
            5,
            3,
            2,
            1,
            2,
            4,
            2,
            4,
            5,
            6,
            6,
            5,
            6,
            2
        ];

        _playSequence(id, seq, 41);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), ACTIVE, "41 plies: still active");

        vm.expectEmit(true, true, false, false);
        emit MoveMade(id, bob, seq[41], 5);
        vm.expectEmit(true, true, false, false);
        emit GameWon(id, bob);
        _move(bob, id, seq[41]);

        g = _view(id);
        assertEq(uint8(g.status), WON, "winner must beat draw on a full board");
        assertEq(g.winner, bob);
    }

    // ------------------------------------------------------------------
    // Q, R, S, T, U, Z. Timeout / forfeit
    // ------------------------------------------------------------------

    function test_Timeout_OpponentClaimsAfterDeadline() public {
        uint256 id = _createActive();
        uint256 lastMove = block.timestamp;

        // Strictly before or exactly at the deadline: rejected.
        vm.warp(lastMove + cf.TIMEOUT() - 1);
        vm.prank(bob);
        vm.expectRevert(ConnectFour.TimeoutNotReached.selector);
        cf.claimTimeout(id);

        vm.warp(lastMove + cf.TIMEOUT()); // exact boundary must also fail
        vm.prank(bob);
        vm.expectRevert(ConnectFour.TimeoutNotReached.selector);
        cf.claimTimeout(id);

        // Strictly after the deadline: the player not on turn wins.
        vm.warp(lastMove + cf.TIMEOUT() + 1);
        vm.expectEmit(true, true, false, false);
        emit GameForfeited(id, bob);
        vm.prank(bob);
        cf.claimTimeout(id);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), FORFEITED, "finished state recorded");
        assertEq(g.winner, bob, "non-turn player awarded the game");
    }

    function test_Timeout_CurrentPlayerCannotClaimOwnStall() public {
        uint256 id = _createActive(); // Alice is on turn
        vm.warp(block.timestamp + cf.TIMEOUT() + 1);

        vm.prank(alice);
        vm.expectRevert(ConnectFour.NotYourTurn.selector);
        cf.claimTimeout(id);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), ACTIVE, "game untouched");
    }

    function test_Timeout_AfterMoveTheRolesFlip() public {
        uint256 id = _createActive();
        _move(alice, id, 0); // now Bob is on turn, Alice is the waiting player
        uint256 lastMove = block.timestamp;

        vm.warp(lastMove + cf.TIMEOUT() + 1);
        vm.prank(alice);
        cf.claimTimeout(id);

        ConnectFour.GameView memory g = _view(id);
        assertEq(uint8(g.status), FORFEITED);
        assertEq(g.winner, alice, "waiting player wins the forfeit");
    }

    function test_Timeout_WorksAfterManyDaysOfInactivity() public {
        uint256 id = _createActive();
        vm.warp(block.timestamp + 30 days);

        vm.prank(bob);
        cf.claimTimeout(id);
        assertEq(uint8(_view(id).status), FORFEITED);
    }

    function test_Timeout_NonPlayerCannotClaim() public {
        uint256 id = _createActive();
        vm.warp(block.timestamp + cf.TIMEOUT() + 1);

        vm.prank(carol);
        vm.expectRevert(ConnectFour.NotAPlayer.selector);
        cf.claimTimeout(id);
        assertEq(uint8(_view(id).status), ACTIVE);
    }

    function test_Timeout_CannotBeClaimedForFinishedGame() public {
        uint256 id = _createActive();
        _move(alice, id, 0);
        _move(bob, id, 6);
        _move(alice, id, 1);
        _move(bob, id, 6);
        _move(alice, id, 2);
        _move(bob, id, 6);
        _move(alice, id, 3); // alice wins

        vm.warp(block.timestamp + cf.TIMEOUT() + 1);
        vm.prank(bob);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.claimTimeout(id);

        assertEq(uint8(_view(id).status), WON, "win result preserved");
        assertEq(_view(id).winner, alice);
    }

    function test_Timeout_AfterForfeitGameIsClosed() public {
        uint256 id = _createActive();
        vm.warp(block.timestamp + cf.TIMEOUT() + 1);
        vm.prank(bob);
        cf.claimTimeout(id);

        // Double claim impossible.
        vm.warp(block.timestamp + cf.TIMEOUT() + 1);
        vm.prank(bob);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.claimTimeout(id);

        // Moves impossible too.
        vm.prank(alice);
        vm.expectRevert(ConnectFour.GameNotActive.selector);
        cf.makeMove(id, 0);
    }

    function test_Timeout_NonexistentGameReverts() public {
        vm.prank(bob);
        vm.expectRevert(ConnectFour.GameNotFound.selector);
        cf.claimTimeout(1);
    }

    // ------------------------------------------------------------------
    // V. Multiple simultaneous games
    // ------------------------------------------------------------------

    function test_MultipleGames_RunIndependently() public {
        uint256 g1 = _createActive(); // alice vs bob, alice to move
        vm.prank(dave);
        uint256 g2 = cf.createGame(); // dave creates
        vm.prank(carol);
        cf.joinGame(g2); // carol joins, dave (creator) to move

        // Divergent move histories.
        _move(alice, g1, 0);
        _move(dave, g2, 6);

        ConnectFour.GameView memory v1 = _view(g1);
        ConnectFour.GameView memory v2 = _view(g2);
        assertTrue(v1.playerOnePieces != v2.playerOnePieces, "boards differ");
        assertEq(v1.currentTurn, bob, "g1: bob to move");
        assertEq(v2.currentTurn, carol, "g2: carol to move");

        // Finishing g1 must not touch g2.
        _move(bob, g1, 6);
        _move(alice, g1, 1);
        _move(bob, g1, 6);
        _move(alice, g1, 2);
        _move(bob, g1, 6);
        _move(alice, g1, 3); // g1 won by alice
        assertEq(uint8(_view(g1).status), WON);
        assertEq(uint8(_view(g2).status), ACTIVE, "g2 still active");

        // g2 plays on normally.
        _move(carol, g2, 5);
        v2 = _view(g2);
        assertEq(v2.currentTurn, dave, "g2: dave to move after carol");
        assertEq(v2.winner, address(0));

        // Timeout on one game does not leak into the other.
        vm.warp(block.timestamp + cf.TIMEOUT() + 1);
        vm.prank(carol); // carol is the player NOT on turn in g2
        cf.claimTimeout(g2);
        assertEq(uint8(_view(g2).status), FORFEITED);
        assertEq(_view(g2).winner, carol, "non-turn player wins the forfeit");
        assertEq(uint8(_view(g1).status), WON, "g1 result untouched");
        assertEq(_view(g1).winner, alice);
    }

    // ------------------------------------------------------------------
    // W. Events identify the game
    // ------------------------------------------------------------------

    function test_MoveMade_EventIndexesGameId() public {
        uint256 id = _createActive();
        uint256 other = _create();
        vm.prank(bob);
        cf.joinGame(other);

        // expectEmit(true, true, false, true): both indexed topics (gameId,
        // player) plus the ABI-encoded (column, row) data are checked.
        vm.expectEmit(true, true, false, true);
        emit MoveMade(id, alice, 2, 0);
        _move(alice, id, 2);

        vm.expectEmit(true, true, false, true);
        emit MoveMade(other, alice, 0, 0);
        _move(alice, other, 0);
    }

    // ------------------------------------------------------------------
    // getGame / getBoard fidelity
    // ------------------------------------------------------------------

    function test_GetGame_ReturnsTimeoutDeadline() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 5 days);
        vm.prank(bob);
        cf.joinGame(id);

        ConnectFour.GameView memory g = _view(id);
        assertEq(
            g.timeoutDeadline,
            uint64(block.timestamp) + uint64(cf.TIMEOUT()),
            "deadline derived from last activity"
        );
    }

    function test_GetBoard_UsesTopLeftOriginAndPlayerTags() public {
        uint256 id = _createActive();
        _move(alice, id, 0); // storage row 0, col 0
        _move(bob, id, 0); // storage row 1, col 0
        _move(alice, id, 6); // storage row 0, col 6

        uint8[42] memory board = cf.getBoard(id);
        // Display index = (5 - storageRow) * 7 + col
        assertEq(board[35], 1, "alice bottom-left");
        assertEq(board[28], 2, "bob stacked above alice");
        assertEq(board[41], 1, "alice bottom-right");
        assertEq(board[0], 0, "top-left empty");
        assertEq(board[36], 0, "column 1 untouched");
    }
}

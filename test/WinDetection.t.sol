// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ConnectFour} from "../src/ConnectFour.sol";

/// @dev Exposes the internal win check so direction logic can be unit-tested
///      directly with crafted boards (including runs longer than four, which
///      the live game can never produce because it ends at exactly four).
contract ConnectFourHarness is ConnectFour {
    function hasWon(uint64 mask, uint256 origin) external pure returns (bool) {
        return _hasWon(mask, origin);
    }
}

contract WinDetectionTest is Test {
    ConnectFourHarness internal cf;

    // Cell index convention: cell = row * 7 + column, row 0 = bottom.
    function _bit(uint8 row, uint8 col) internal pure returns (uint256) {
        return uint256(row) * 7 + col;
    }

    function _mask(uint256[] memory cells) internal pure returns (uint64 m) {
        for (uint256 i = 0; i < cells.length; i++) {
            m |= uint64(1) << cells[i];
        }
    }

    function _cells4(uint8 r0, uint8 c0, int8 dr, int8 dc)
        internal
        pure
        returns (uint256[] memory out)
    {
        out = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) {
            uint256 r = uint256(int256(uint256(r0)) + int256(dr) * int256(i));
            uint256 c = uint256(int256(uint256(c0)) + int256(dc) * int256(i));
            out[i] = r * 7 + c;
        }
    }

    function setUp() public {
        cf = new ConnectFourHarness();
    }

    // ------------------------------------------------------------------
    // Exactly four
    // ------------------------------------------------------------------

    function test_FourInARow_Horizontal() public {
        uint64 mask = _mask(_cells4(0, 0, 0, 1));
        assertTrue(cf.hasWon(mask, _bit(0, 0)));
        assertTrue(cf.hasWon(mask, _bit(0, 1)));
        assertTrue(cf.hasWon(mask, _bit(0, 2)));
        assertTrue(cf.hasWon(mask, _bit(0, 3)));
        assertFalse(cf.hasWon(mask, _bit(0, 4)), "empty cell beyond the run");
    }

    function test_FourInARow_Vertical() public {
        uint64 mask = _mask(_cells4(0, 5, 1, 0));
        assertTrue(cf.hasWon(mask, _bit(0, 5)));
        assertTrue(cf.hasWon(mask, _bit(3, 5)));
        assertFalse(cf.hasWon(mask, _bit(4, 5)), "empty cell above the run");
    }

    function test_FourInARow_DiagonalBottomLeftToTopRight() public {
        uint64 mask = _mask(_cells4(0, 0, 1, 1));
        assertTrue(cf.hasWon(mask, _bit(0, 0)));
        assertTrue(cf.hasWon(mask, _bit(1, 1)));
        assertTrue(cf.hasWon(mask, _bit(2, 2)));
        assertTrue(cf.hasWon(mask, _bit(3, 3)));
    }

    function test_FourInARow_DiagonalTopLeftToBottomRight() public {
        uint64 mask = _mask(_cells4(0, 3, 1, -1));
        assertTrue(cf.hasWon(mask, _bit(0, 3)));
        assertTrue(cf.hasWon(mask, _bit(1, 2)));
        assertTrue(cf.hasWon(mask, _bit(2, 1)));
        assertTrue(cf.hasWon(mask, _bit(3, 0)));
    }

    // ------------------------------------------------------------------
    // More than four
    // ------------------------------------------------------------------

    function test_FiveInARow_AllDirections() public {
        uint256 i;

        // vertical 5
        uint64 vert = 0;
        for (i = 0; i < 5; i++) {
            vert |= uint64(1) << _bit(uint8(i), 0);
        }
        assertTrue(cf.hasWon(vert, _bit(0, 0)));
        assertTrue(cf.hasWon(vert, _bit(4, 0)));

        // horizontal 5
        uint64 horz = 0;
        for (i = 0; i < 5; i++) {
            horz |= uint64(1) << _bit(0, uint8(i));
        }
        assertTrue(cf.hasWon(horz, _bit(0, 0)));
        assertTrue(cf.hasWon(horz, _bit(0, 4)));

        // diagonal bottom-left -> top-right, 5 long
        uint64 dp = 0;
        for (i = 0; i < 5; i++) {
            dp |= uint64(1) << _bit(uint8(i), uint8(i));
        }
        assertTrue(cf.hasWon(dp, _bit(0, 0)));
        assertTrue(cf.hasWon(dp, _bit(4, 4)));

        // diagonal top-left -> bottom-right, 5 long
        uint64 dm = 0;
        for (i = 0; i < 5; i++) {
            dm |= uint64(1) << _bit(uint8(i), uint8(4 - i));
        }
        assertTrue(cf.hasWon(dm, _bit(0, 4)));
        assertTrue(cf.hasWon(dm, _bit(4, 0)));
    }

    function test_SixInARow_Vertical() public {
        uint64 mask = 0;
        for (uint256 i = 0; i < 6; i++) {
            mask |= uint64(1) << _bit(uint8(i), 2);
        }
        assertTrue(cf.hasWon(mask, _bit(0, 2)));
        assertTrue(cf.hasWon(mask, _bit(5, 2)));
        assertFalse(cf.hasWon(mask, _bit(5, 3)), "neighbour column untouched");
    }

    // ------------------------------------------------------------------
    // Non-winning / near-miss positions
    // ------------------------------------------------------------------

    function test_ThreeInARow_IsNotAWin() public {
        uint64 mask = _mask(_cells4(0, 0, 0, 1));
        mask &= ~(uint64(1) << _bit(0, 3)); // remove the fourth piece
        assertFalse(cf.hasWon(mask, _bit(0, 0)));
        assertFalse(cf.hasWon(mask, _bit(0, 2)));
    }

    function test_ThreeWithGap_IsNotAWin() public {
        uint256[] memory cells = new uint256[](4);
        cells[0] = _bit(0, 0);
        cells[1] = _bit(0, 1);
        cells[2] = _bit(0, 2);
        cells[3] = _bit(0, 4); // gap at column 3
        uint64 mask = _mask(cells);
        assertFalse(cf.hasWon(mask, _bit(0, 0)));
        assertFalse(cf.hasWon(mask, _bit(0, 4)));
    }

    function test_LShape_IsNotAWin() public {
        uint256[] memory cells = new uint256[](4);
        cells[0] = _bit(0, 0);
        cells[1] = _bit(0, 1);
        cells[2] = _bit(1, 0);
        cells[3] = _bit(1, 1);
        uint64 mask = _mask(cells);
        assertFalse(cf.hasWon(mask, _bit(0, 0)), "2x2 block is not a line");
        assertFalse(cf.hasWon(mask, _bit(1, 1)));
    }

    function test_ThreeVerticalPlusSide_IsNotAWin() public {
        uint256[] memory cells = new uint256[](4);
        cells[0] = _bit(0, 0);
        cells[1] = _bit(1, 0);
        cells[2] = _bit(2, 0);
        cells[3] = _bit(1, 1);
        uint64 mask = _mask(cells);
        assertFalse(cf.hasWon(mask, _bit(2, 0)));
        assertFalse(cf.hasWon(mask, _bit(1, 1)));
    }

    function test_EmptyBoard_HasNoWinner() public {
        assertFalse(cf.hasWon(0, 0));
    }

    // ------------------------------------------------------------------
    // Board edges (walking off the board must not revert)
    // ------------------------------------------------------------------

    function test_WinOnTopRow_AndBoardEdges() public {
        uint64 top = _mask(_cells4(5, 0, 0, 1)); // top row, columns 0-3
        assertTrue(cf.hasWon(top, _bit(5, 0)));
        assertTrue(cf.hasWon(top, _bit(5, 3)));

        uint64 right = _mask(_cells4(0, 6, 1, 0)); // right column, rows 0-3
        assertTrue(cf.hasWon(right, _bit(0, 6)));
        assertTrue(cf.hasWon(right, _bit(3, 6)));

        uint64 toCorner = _mask(_cells4(0, 3, 1, 1)); // ends one row below top-right
        assertTrue(cf.hasWon(toCorner, _bit(3, 6)));

        uint64 throughTopRight = _mask(_cells4(2, 3, 1, 1)); // (2,3)..(5,6)
        assertTrue(cf.hasWon(throughTopRight, _bit(5, 6)));

        uint64 topEdgeDown = _mask(_cells4(2, 0, 1, 1)); // starts left edge, row 2
        assertTrue(cf.hasWon(topEdgeDown, _bit(2, 0)));
    }

    function test_OriginMustBeOccupied() public {
        // Three in a row with the origin cell EMPTY must not report a win
        // (the contract only ever queries the cell it just filled).
        uint256[] memory cells = new uint256[](3);
        cells[0] = _bit(0, 0);
        cells[1] = _bit(0, 1);
        cells[2] = _bit(0, 2);
        uint64 mask = _mask(cells);
        assertFalse(cf.hasWon(mask, _bit(0, 3)), "empty origin excluded");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ConnectFour} from "../src/ConnectFour.sol";

/// @notice Reproducible Base Sepolia deployment.
///
/// Usage:
///   cp .env.example .env   # fill PRIVATE_KEY + BASE_SEPOLIA_RPC_URL
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
///
/// The script refuses to broadcast unless the connected chain id matches
/// TARGET_CHAIN_ID (default: 84532, Base Sepolia). The private key is read
/// from the PRIVATE_KEY environment variable and is never logged.
contract Deploy is Script {
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    function run() external returns (ConnectFour game) {
        uint256 targetChainId = vm.envOr("TARGET_CHAIN_ID", BASE_SEPOLIA_CHAIN_ID);
        if (block.chainid != targetChainId) {
            revert(
                string.concat(
                    "Deploy: chain id mismatch (expected ", vm.toString(targetChainId), ")"
                )
            );
        }

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        game = new ConnectFour();
        vm.stopBroadcast();

        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        string memory json = string.concat(
            '{"address":"',
            vm.toString(address(game)),
            '","chainId":',
            vm.toString(block.chainid),
            ',"deployer":"',
            vm.toString(deployer),
            '","deployedAt":',
            vm.toString(block.timestamp),
            "}"
        );
        vm.writeFile(path, json);

        console2.log("ConnectFour deployed at:", address(game));
        console2.log("Chain id:", block.chainid);
        console2.log("Deployer:", deployer);
        console2.log("Metadata written to:", path);
    }
}

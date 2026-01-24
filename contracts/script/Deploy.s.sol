// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DNASubscriber} from "../src/DNASubscriber.sol";
import {DNAReader} from "../src/DNAReader.sol";
import {AdvancedPositionManager} from "../src/AdvancedPositionManager.sol";
import {POOL_MANAGER, POSITION_MANAGER, STATE_VIEW} from "../src/Constants.sol";

/// @title DeployScript
/// @notice Deployment script for DeFi DNA contracts on Base Sepolia
contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        // Verify we're on Base Sepolia
        require(block.chainid == 84_532, "Deploy on Base Sepolia only (chain 84532)");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy DNASubscriber
        DNASubscriber dnaSubscriber = new DNASubscriber(POSITION_MANAGER, STATE_VIEW);
        console.log("DNASubscriber deployed at:", address(dnaSubscriber));

        // Deploy DNAReader
        DNAReader dnaReader = new DNAReader(POOL_MANAGER, STATE_VIEW, POSITION_MANAGER);
        console.log("DNAReader deployed at:", address(dnaReader));

        // Deploy AdvancedPositionManager
        AdvancedPositionManager advancedPosManager =
            new AdvancedPositionManager(POOL_MANAGER, POSITION_MANAGER);
        console.log("AdvancedPositionManager deployed at:", address(advancedPosManager));

        vm.stopBroadcast();

        // Log deployment info
        console.log("\n========================================");
        console.log("        DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Network: Base Sepolia (84532)");
        console.log("DNASubscriber:", address(dnaSubscriber));
        console.log("DNAReader:", address(dnaReader));
        console.log("AdvancedPositionManager:", address(advancedPosManager));
        console.log("========================================");
        console.log("        DEPENDENCIES");
        console.log("========================================");
        console.log("PoolManager:", POOL_MANAGER);
        console.log("PositionManager:", POSITION_MANAGER);
        console.log("StateView:", STATE_VIEW);
        console.log("========================================");
        console.log("\nUpdate these addresses in backend/env.example:");
        console.log("DNA_SUBSCRIBER_ADDRESS=", address(dnaSubscriber));
        console.log("DNA_READER_ADDRESS=", address(dnaReader));
        console.log("ADVANCED_POSITION_MANAGER=", address(advancedPosManager));
    }
}

/// @title DeployMainnetScript
/// @notice Deployment script for Ethereum mainnet
contract DeployMainnetScript is Script {
    // Mainnet addresses
    address constant MAINNET_POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address constant MAINNET_POSITION_MANAGER = 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e;
    address constant MAINNET_STATE_VIEW = 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        require(block.chainid == 1, "Deploy on Mainnet only (chain 1)");

        vm.startBroadcast(deployerPrivateKey);

        DNASubscriber dnaSubscriber =
            new DNASubscriber(MAINNET_POSITION_MANAGER, MAINNET_STATE_VIEW);
        console.log("DNASubscriber deployed at:", address(dnaSubscriber));

        DNAReader dnaReader =
            new DNAReader(MAINNET_POOL_MANAGER, MAINNET_STATE_VIEW, MAINNET_POSITION_MANAGER);
        console.log("DNAReader deployed at:", address(dnaReader));

        AdvancedPositionManager advancedPosManager =
            new AdvancedPositionManager(MAINNET_POOL_MANAGER, MAINNET_POSITION_MANAGER);
        console.log("AdvancedPositionManager deployed at:", address(advancedPosManager));

        vm.stopBroadcast();
    }
}

/// @title DeployLocalScript
/// @notice Deployment script for local Anvil testing
contract DeployLocalScript is Script {
    function run() public {
        // Use default Anvil private key
        uint256 deployerPrivateKey =
            0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        vm.startBroadcast(deployerPrivateKey);

        // For local testing, deploy with zero addresses (would need mocks in real testing)
        // This is just a placeholder for structure

        console.log("Local deployment - would deploy with mock contracts");

        vm.stopBroadcast();
    }
}

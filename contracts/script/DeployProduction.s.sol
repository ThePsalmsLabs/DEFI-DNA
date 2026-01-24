// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DNASubscriber} from "../src/DNASubscriber.sol";
import {DNAReader} from "../src/DNAReader.sol";
import {AdvancedPositionManager} from "../src/AdvancedPositionManager.sol";
import {POOL_MANAGER, POSITION_MANAGER, STATE_VIEW} from "../src/Constants.sol";

/// @title DeployProductionScript
/// @notice Production deployment script using cast wallet (keystore)
/// @dev This script uses --account flag instead of private keys
/// @dev Usage: forge script script/DeployProduction.s.sol:DeployBaseSepolia --rpc-url base_sepolia --account deployer --sender <ADDRESS> --broadcast --verify
contract DeployBaseSepolia is Script {

    // Base Sepolia addresses
    address constant BASE_SEPOLIA_POOL_MANAGER = 0x7Da1D65F8B249183667cdE74C5CBD46dD38AA829;
    address constant BASE_SEPOLIA_POSITION_MANAGER = 0xb433dB97Fe3dB8748E5e2B2dc8b4Fb9b5b8eb75d;
    address constant BASE_SEPOLIA_STATE_VIEW = 0x24C731645AcfCaBAD99B894a5C0E32Dfb8448dfb;

    function run() public returns (address subscriberAddr, address readerAddr, address managerAddr) {
        // Verify we're on Base Sepolia
        require(block.chainid == 84532, "Must deploy on Base Sepolia (chain 84532)");

        console.log("========================================");
        console.log("  DEFI DNA - BASE SEPOLIA DEPLOYMENT");
        console.log("========================================");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", address(msg.sender).balance / 1e18, "ETH");
        console.log("");

        // Verify deployer has enough ETH (at least 0.01 ETH)
        require(address(msg.sender).balance >= 0.01 ether, "Insufficient ETH balance");

        // Start broadcasting transactions
        vm.startBroadcast();

        // 1. Deploy DNASubscriber
        console.log("Deploying DNASubscriber...");
        DNASubscriber dnaSubscriber = new DNASubscriber(
            BASE_SEPOLIA_POSITION_MANAGER,
            BASE_SEPOLIA_STATE_VIEW
        );
        subscriberAddr = address(dnaSubscriber);
        console.log("  DNASubscriber deployed at:", subscriberAddr);

        // 2. Deploy DNAReader
        console.log("Deploying DNAReader...");
        DNAReader dnaReader = new DNAReader(
            BASE_SEPOLIA_POOL_MANAGER,
            BASE_SEPOLIA_STATE_VIEW,
            BASE_SEPOLIA_POSITION_MANAGER
        );
        readerAddr = address(dnaReader);
        console.log("  DNAReader deployed at:", readerAddr);

        // 3. Deploy AdvancedPositionManager
        console.log("Deploying AdvancedPositionManager...");
        AdvancedPositionManager advancedPosManager = new AdvancedPositionManager(
            BASE_SEPOLIA_POOL_MANAGER,
            BASE_SEPOLIA_POSITION_MANAGER
        );
        managerAddr = address(advancedPosManager);
        console.log("  AdvancedPositionManager deployed at:", managerAddr);

        // Note: AdvancedPositionManager (V1) doesn't have AccessControl
        // For V2 deployment with access control, use AdvancedPositionManagerV2

        vm.stopBroadcast();

        // Print deployment summary
        console.log("");
        console.log("========================================");
        console.log("        DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Network: Base Sepolia (84532)");
        console.log("");
        console.log("Deployed Contracts:");
        console.log("  DNASubscriber:           ", subscriberAddr);
        console.log("  DNAReader:               ", readerAddr);
        console.log("  AdvancedPositionManager: ", managerAddr);
        console.log("");
        console.log("Uniswap V4 Dependencies:");
        console.log("  PoolManager:             ", BASE_SEPOLIA_POOL_MANAGER);
        console.log("  PositionManager:         ", BASE_SEPOLIA_POSITION_MANAGER);
        console.log("  StateView:               ", BASE_SEPOLIA_STATE_VIEW);
        console.log("========================================");
        console.log("");
        console.log("Next Steps:");
        console.log("1. Verify contracts on BaseScan");
        console.log("2. Update backend .env with these addresses:");
        console.log("   DNA_SUBSCRIBER_ADDRESS=", subscriberAddr);
        console.log("   DNA_READER_ADDRESS=", readerAddr);
        console.log("   ADVANCED_POSITION_MANAGER=", managerAddr);
        console.log("3. Test contracts with fork tests");
        console.log("4. Run security checks");
        console.log("");

        // Save deployment info to file
        _saveDeployment(subscriberAddr, readerAddr, managerAddr);
    }

    function _saveDeployment(address subscriber, address reader, address manager) internal {
        string memory json = string(abi.encodePacked(
            '{\n',
            '  "network": "base-sepolia",\n',
            '  "chainId": 84532,\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "deployer": "', vm.toString(msg.sender), '",\n',
            '  "contracts": {\n',
            '    "DNASubscriber": "', vm.toString(subscriber), '",\n',
            '    "DNAReader": "', vm.toString(reader), '",\n',
            '    "AdvancedPositionManager": "', vm.toString(manager), '"\n',
            '  },\n',
            '  "dependencies": {\n',
            '    "PoolManager": "', vm.toString(BASE_SEPOLIA_POOL_MANAGER), '",\n',
            '    "PositionManager": "', vm.toString(BASE_SEPOLIA_POSITION_MANAGER), '",\n',
            '    "StateView": "', vm.toString(BASE_SEPOLIA_STATE_VIEW), '"\n',
            '  }\n',
            '}'
        ));

        vm.writeFile("deployments/base-sepolia.json", json);
        console.log("Deployment info saved to: deployments/base-sepolia.json");
    }
}

/// @title DeployBaseMainnet
/// @notice Production deployment for Base Mainnet
/// @dev Usage: forge script script/DeployProduction.s.sol:DeployBaseMainnet --rpc-url base --account deployer --sender <ADDRESS> --broadcast --verify
contract DeployBaseMainnet is Script {

    // Base Mainnet addresses
    address constant BASE_POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
    address constant BASE_POSITION_MANAGER = 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e;
    address constant BASE_STATE_VIEW = 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227;

    function run() public returns (address subscriberAddr, address readerAddr, address managerAddr) {
        // Verify we're on Base Mainnet
        require(block.chainid == 8453, "Must deploy on Base Mainnet (chain 8453)");

        console.log("========================================");
        console.log("   DEFI DNA - BASE MAINNET DEPLOYMENT");
        console.log("========================================");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", address(msg.sender).balance / 1e18, "ETH");
        console.log("");

        // Verify deployer has enough ETH (at least 0.05 ETH for mainnet)
        require(address(msg.sender).balance >= 0.05 ether, "Insufficient ETH balance (need at least 0.05)");

        // SAFETY CHECK: Confirm deployment to mainnet
        console.log("WARNING: You are about to deploy to BASE MAINNET");
        console.log("Press Ctrl+C to cancel, or wait 10 seconds to continue...");

        // Start broadcasting transactions
        vm.startBroadcast();

        // 1. Deploy DNASubscriber
        console.log("Deploying DNASubscriber...");
        DNASubscriber dnaSubscriber = new DNASubscriber(
            BASE_POSITION_MANAGER,
            BASE_STATE_VIEW
        );
        subscriberAddr = address(dnaSubscriber);
        console.log("  DNASubscriber deployed at:", subscriberAddr);

        // 2. Deploy DNAReader
        console.log("Deploying DNAReader...");
        DNAReader dnaReader = new DNAReader(
            BASE_POOL_MANAGER,
            BASE_STATE_VIEW,
            BASE_POSITION_MANAGER
        );
        readerAddr = address(dnaReader);
        console.log("  DNAReader deployed at:", readerAddr);

        // 3. Deploy AdvancedPositionManager
        console.log("Deploying AdvancedPositionManager...");
        AdvancedPositionManager advancedPosManager = new AdvancedPositionManager(
            BASE_POOL_MANAGER,
            BASE_POSITION_MANAGER
        );
        managerAddr = address(advancedPosManager);
        console.log("  AdvancedPositionManager deployed at:", managerAddr);

        // Note: AdvancedPositionManager (V1) doesn't have AccessControl
        // For V2 deployment with access control, use AdvancedPositionManagerV2
        // IMPORTANT: For production with emergency controls, deploy V2 instead

        vm.stopBroadcast();

        // Print deployment summary
        console.log("");
        console.log("========================================");
        console.log("        DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Network: Base Mainnet (8453)");
        console.log("");
        console.log("Deployed Contracts:");
        console.log("  DNASubscriber:           ", subscriberAddr);
        console.log("  DNAReader:               ", readerAddr);
        console.log("  AdvancedPositionManager: ", managerAddr);
        console.log("");
        console.log("Uniswap V4 Dependencies:");
        console.log("  PoolManager:             ", BASE_POOL_MANAGER);
        console.log("  PositionManager:         ", BASE_POSITION_MANAGER);
        console.log("  StateView:               ", BASE_STATE_VIEW);
        console.log("========================================");
        console.log("");
        console.log("CRITICAL NEXT STEPS:");
        console.log("1. Verify contracts on BaseScan IMMEDIATELY");
        console.log("2. Grant EMERGENCY_ROLE to multisig");
        console.log("3. Transfer DEFAULT_ADMIN_ROLE to multisig");
        console.log("4. Renounce deployer roles");
        console.log("5. Test all functions on mainnet fork");
        console.log("6. Monitor for first 24 hours");
        console.log("");

        // Save deployment info
        _saveDeployment(subscriberAddr, readerAddr, managerAddr);
    }

    function _saveDeployment(address subscriber, address reader, address manager) internal {
        string memory json = string(abi.encodePacked(
            '{\n',
            '  "network": "base-mainnet",\n',
            '  "chainId": 8453,\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "deployer": "', vm.toString(msg.sender), '",\n',
            '  "contracts": {\n',
            '    "DNASubscriber": "', vm.toString(subscriber), '",\n',
            '    "DNAReader": "', vm.toString(reader), '",\n',
            '    "AdvancedPositionManager": "', vm.toString(manager), '"\n',
            '  },\n',
            '  "dependencies": {\n',
            '    "PoolManager": "', vm.toString(BASE_POOL_MANAGER), '",\n',
            '    "PositionManager": "', vm.toString(BASE_POSITION_MANAGER), '",\n',
            '    "StateView": "', vm.toString(BASE_STATE_VIEW), '"\n',
            '  }\n',
            '}'
        ));

        vm.writeFile("deployments/base-mainnet.json", json);
        console.log("Deployment info saved to: deployments/base-mainnet.json");
    }
}

/// @title VerifyContracts
/// @notice Verify deployed contracts on BaseScan
/// @dev Run after deployment to verify source code
contract VerifyContracts is Script {
    function run() public {
        // Read deployment info
        string memory json = vm.readFile("deployments/base-sepolia.json");

        console.log("Contract verification commands:");
        console.log("");
        console.log("forge verify-contract --chain-id 84532 --watch \\");
        console.log("  <DNA_SUBSCRIBER_ADDRESS> \\");
        console.log("  src/DNASubscriber.sol:DNASubscriber");
        console.log("");
        console.log("forge verify-contract --chain-id 84532 --watch \\");
        console.log("  <DNA_READER_ADDRESS> \\");
        console.log("  src/DNAReader.sol:DNAReader");
        console.log("");
        console.log("forge verify-contract --chain-id 84532 --watch \\");
        console.log("  <ADVANCED_POSITION_MANAGER_ADDRESS> \\");
        console.log("  src/AdvancedPositionManager.sol:AdvancedPositionManager");
    }
}

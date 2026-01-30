// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {DNASubscriber} from "../src/DNASubscriber.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract RecordSwap is Script {
    using PoolIdLibrary for PoolKey;
    
    // Base Mainnet DNASubscriber
    DNASubscriber constant dnaSubscriber = DNASubscriber(0xeAC0CCcaf338264f74D6Bb7E033A24Df8b201884);
    
    // Base Mainnet token addresses
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    function run() external {
        // Create PoolKey for WETH/USDC 0.3% pool
        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(WETH),
            currency1: Currency.wrap(USDC),
            fee: 3000,        // 0.3%
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        
        PoolId poolId = poolKey.toId();
        
        // Exact values to use (use any valid checksummed address)
        address user = 0x742D35CC6634c0532925A3b844BC9E7595F0BEb0;
        uint128 volumeUsd = 1000 * 1e18; // $1,000
        
        console.log("=== recordSwap Call ===");
        console.log("Contract:", address(dnaSubscriber));
        console.log("User:", user);
        console.log("PoolId:", vm.toString(PoolId.unwrap(poolId)));
        console.log("Volume:", volumeUsd, "($1,000 USD)");
        console.log("");
        
        vm.startBroadcast();
        
        // Call recordSwap
        dnaSubscriber.recordSwap(user, poolId, volumeUsd);
        
        console.log("Swap recorded successfully.");
        
        vm.stopBroadcast();
    }
}

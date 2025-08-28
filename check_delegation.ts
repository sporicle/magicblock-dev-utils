import { Connection, PublicKey } from '@solana/web3.js';

// Delegation program constants
const DELEGATION_PROGRAM_STR = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
const DELEGATION_RECORD_DATA_SIZE = 96;
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

// Result interface
export interface DelegationResult {
  accountPubkey: string;
  delegationPDA: string;
  status: 'DELEGATED' | 'NOT_DELEGATED';
  validatorIdentity?: string;
  pdaAccount?: {
    lamports: number;
    owner: string;
    dataLength: number;
    executable: boolean;
    rentEpoch: number;
  };
  rawData?: {
    discriminator: number[];
    identityBytes: number[];
  };
}

// PDA derivation function
function getDelegationRecordPDA(accountPubkey: PublicKey): PublicKey {
  const delegationProgram = new PublicKey(DELEGATION_PROGRAM_STR);
  // Use TextEncoder for cross-platform compatibility
  const textEncoder = new TextEncoder();
  const seeds = [textEncoder.encode("delegation"), accountPubkey.toBuffer()];
  const [pda] = PublicKey.findProgramAddressSync(seeds, delegationProgram);
  return pda;
}

// Data extraction function
function extractDelegationIdentity(data: Buffer | Uint8Array): PublicKey | null {
  if (data.length !== DELEGATION_RECORD_DATA_SIZE) return null;
  // Bytes 0-7: discriminator, Bytes 8-39: validator identity (32 bytes)
  const identityBytes = data.slice(8, 40);
  return new PublicKey(identityBytes);
}

// Main delegation checking function
export async function checkDelegation(accountPubkeyStr: string, rpcUrl?: string): Promise<DelegationResult> {
  const finalRpcUrl = rpcUrl || DEFAULT_RPC_URL;
  
  console.log(`Checking delegation for account: ${accountPubkeyStr}`);
  console.log(`Using RPC URL: ${finalRpcUrl}`);
  
  try {
    // Parse account pubkey
    const accountPubkey = new PublicKey(accountPubkeyStr);
    
    // Create RPC connection
    const connection = new Connection(finalRpcUrl, 'confirmed');
    
    // Calculate delegation PDA
    const delegationPDA = getDelegationRecordPDA(accountPubkey);
    
    console.log(`Delegation PDA: ${delegationPDA.toString()}`);
    
    // Query PDA account
    const pdaAccountInfo = await connection.getAccountInfo(delegationPDA, 'confirmed');
    
    const result: DelegationResult = {
      accountPubkey: accountPubkeyStr,
      delegationPDA: delegationPDA.toString(),
      status: 'NOT_DELEGATED'
    };
    
    if (!pdaAccountInfo || pdaAccountInfo.lamports === 0) {
      console.log(`No delegation found - PDA account ${pdaAccountInfo ? 'exists but has 0 lamports' : 'does not exist'}`);
      return result;
    }
    
    // Store PDA account info
    result.pdaAccount = {
      lamports: pdaAccountInfo.lamports,
      owner: pdaAccountInfo.owner.toString(),
      dataLength: pdaAccountInfo.data.length,
      executable: pdaAccountInfo.executable,
      rentEpoch: pdaAccountInfo.rentEpoch
    };
    
    // Extract validator identity
    const validatorIdentity = extractDelegationIdentity(pdaAccountInfo.data);
    
    if (validatorIdentity) {
      result.status = 'DELEGATED';
      result.validatorIdentity = validatorIdentity.toString();
      result.rawData = {
        discriminator: Array.from(pdaAccountInfo.data.slice(0, 8)),
        identityBytes: Array.from(pdaAccountInfo.data.slice(8, 40))
      };  
      
      console.log(`✅ Account is DELEGATED to validator: ${result.validatorIdentity}`);
    } else {
      console.log(`❌ Account data found but could not extract valid validator identity`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`Error checking delegation:`, error);
    throw new Error(`Failed to check delegation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Multiple delegations checking function
export async function checkMultipleDelegations(accountPubkeys: string[], rpcUrl?: string): Promise<DelegationResult[]> {
  console.log(`Checking delegation for ${accountPubkeys.length} accounts`);
  
  const results: DelegationResult[] = [];
  
  for (const pubkey of accountPubkeys) {
    try {
      const result = await checkDelegation(pubkey, rpcUrl);
      results.push(result);
    } catch (error) {
      console.error(`Failed to check delegation for ${pubkey}:`, error);
      results.push({
        accountPubkey: pubkey,
        delegationPDA: '',
        status: 'NOT_DELEGATED'
      });
    }
  }
  
  return results;
}

// CLI support
if (typeof process !== 'undefined' && process.argv) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: npx ts-node check_delegation.ts <pubkey> [rpc_url]');
    console.log('Example: npx ts-node check_delegation.ts 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
    process.exit(1);
  }
  
  const pubkey = args[0];
  const rpcUrl = args[1];
  
  checkDelegation(pubkey, rpcUrl)
    .then((result) => {
      console.log('\n=== DELEGATION CHECK RESULT ===');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.status === 'DELEGATED') {
        console.log('\n🎯 Magic Router API Usage:');
        console.log(`curl -X POST "https://api.magicrouter.com/getAccountInfo" \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"pubkey": "${result.accountPubkey}"}'`);
      }
    })
    .catch((error) => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

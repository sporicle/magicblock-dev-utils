import { useState, useMemo } from 'react';
import * as React from 'react';
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets';

// Delegation program constants
const DELEGATION_PROGRAM_STR = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
const DELEGATION_RECORD_DATA_SIZE = 96;
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

// Types
interface DelegationResult {
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

interface FormState {
  accountPubkey: string;
  rpcUrl: string;
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

// Ping transaction function
async function sendPingTransaction(
  connection: Connection,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<string> {
  try {
    // Create a simple transfer transaction (no-op by sending 0 lamports)
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: 0, // No-op transaction with 0 lamports
      })
    );

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    // Sign the transaction
    const signedTransaction = await signTransaction(transaction);

    // Send the transaction
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());

    // Confirm the transaction
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return signature;
  } catch (error) {
    throw new Error(`Failed to send ping transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Main delegation checking function
async function checkDelegation(accountPubkeyStr: string, rpcUrl?: string): Promise<DelegationResult> {
  const finalRpcUrl = rpcUrl || DEFAULT_RPC_URL;
  
  try {
    // Parse account pubkey
    const accountPubkey = new PublicKey(accountPubkeyStr);
    
    // Create RPC connection
    const connection = new Connection(finalRpcUrl, 'confirmed');
    
    // Calculate delegation PDA
    const delegationPDA = getDelegationRecordPDA(accountPubkey);
    
    // Query PDA account
    const pdaAccountInfo = await connection.getAccountInfo(delegationPDA, 'confirmed');
    
    const result: DelegationResult = {
      accountPubkey: accountPubkeyStr,
      delegationPDA: delegationPDA.toString(),
      status: 'NOT_DELEGATED'
    };
    
    if (!pdaAccountInfo || pdaAccountInfo.lamports === 0) {
      return result;
    }
    
    // Store PDA account info
    result.pdaAccount = {
      lamports: pdaAccountInfo.lamports,
      owner: pdaAccountInfo.owner.toString(),
      dataLength: pdaAccountInfo.data.length,
      executable: pdaAccountInfo.executable,
      rentEpoch: pdaAccountInfo.rentEpoch ?? 0
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
    }
    
    return result;
    
  } catch (error) {
    throw new Error(`Failed to check delegation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Main component that uses wallet
const DelegationCheckerInner: React.FC = () => {
  const { publicKey, signTransaction, connected } = useWallet();
  const [accountPubkey, setAccountPubkey] = useState('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DelegationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!accountPubkey.trim()) {
      setError('Please enter an account public key');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const delegationResult = await checkDelegation(accountPubkey.trim());
      setResult(delegationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePingTransaction = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setPingError('Please connect your wallet first');
      return;
    }

    if (!accountPubkey.trim()) {
      setPingError('Please enter an account public key first');
      return;
    }

    setPingLoading(true);
    setPingError(null);
    setPingResult(null);

    try {
      const targetPubkey = new PublicKey(accountPubkey.trim());
      const connection = new Connection(DEFAULT_RPC_URL, 'confirmed');

      const signature = await sendPingTransaction(
        connection,
        publicKey,
        targetPubkey,
        signTransaction
      );

      setPingResult(signature);
    } catch (err) {
      setPingError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setPingLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', fontFamily: 'system-ui' }}>
      {/* Wallet in top right */}
      <div style={{ 
        position: 'absolute', 
        top: '20px', 
        right: '20px',
        zIndex: 1000
      }}>
        <WalletMultiButton />
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '60px 20px 20px', fontFamily: 'system-ui' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Delegation Checker</h1>
        
        <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
              Account Public Key:
            </label>
            <input
              type="text"
              value={accountPubkey}
              onChange={(e) => setAccountPubkey(e.target.value)}
              placeholder="Enter Solana account public key"
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px'
              }}
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: loading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '10px'
            }}
          >
            {loading ? 'Checking...' : 'Check Delegation Status'}
          </button>
        </form>

        {/* Ping Transaction Button */}
        <button 
          type="button" 
          onClick={handlePingTransaction}
          disabled={!connected || pingLoading || loading}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: (!connected || pingLoading) ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            cursor: (!connected || pingLoading) ? 'not-allowed' : 'pointer',
            marginBottom: '20px'
          }}
        >
          {pingLoading ? 'Sending Ping...' : 'Send No-Op Ping Transaction'}
        </button>

        {/* Connection Status */}
        {connected && publicKey && (
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '20px', 
            padding: '10px', 
            backgroundColor: '#d4edda', 
            borderRadius: '4px',
            color: '#155724'
          }}>
            ✅ Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
          </div>
        )}
        
        {/* Ping Results */}
        {pingError && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8d7da', 
            border: '1px solid #f5c6cb', 
            borderRadius: '4px', 
            color: '#721c24',
            marginBottom: '20px'
          }}>
            <strong>Ping Error:</strong> {pingError}
          </div>
        )}

        {pingResult && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#d4edda', 
            border: '1px solid #c3e6cb', 
            borderRadius: '4px', 
            color: '#155724',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
              ✅ Ping Transaction Sent
            </div>
            <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
              <div><strong>Signature:</strong> {pingResult}</div>
              <div><strong>From:</strong> {publicKey?.toString()}</div>
              <div><strong>To:</strong> {accountPubkey}</div>
              <div><strong>Amount:</strong> 0 SOL (no-op)</div>
            </div>
          </div>
        )}
        
        {error && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#f8d7da', 
            border: '1px solid #f5c6cb', 
            borderRadius: '4px', 
            color: '#721c24',
            marginBottom: '20px'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {result && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: result.status === 'DELEGATED' ? '#d4edda' : '#fff3cd',
            border: `1px solid ${result.status === 'DELEGATED' ? '#c3e6cb' : '#ffeaa7'}`,
            borderRadius: '4px',
            color: result.status === 'DELEGATED' ? '#155724' : '#856404'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '15px' }}>
              {result.status === 'DELEGATED' ? '✅ Account is DELEGATED' : '❌ Account is NOT DELEGATED'}
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Account Information</h3>
              <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
                <div><strong>Account:</strong> {result.accountPubkey}</div>
                <div><strong>Delegation PDA:</strong> {result.delegationPDA}</div>
                {result.validatorIdentity && (
                  <div><strong>Validator Identity:</strong> {result.validatorIdentity}</div>
                )}
                {!result.validatorIdentity && (
                  <div><strong>Status:</strong> No active delegation found</div>
                )}
              </div>
            </div>

            {result.pdaAccount && (
              <div>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>PDA Account Details</h3>
                <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
                  <div><strong>Lamports:</strong> {result.pdaAccount.lamports}</div>
                  <div><strong>Owner:</strong> {result.pdaAccount.owner}</div>
                  <div><strong>Data Length:</strong> {result.pdaAccount.dataLength} bytes</div>
                  <div><strong>Executable:</strong> {result.pdaAccount.executable.toString()}</div>
                  <div><strong>Rent Epoch:</strong> {result.pdaAccount.rentEpoch}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Wrapper component with wallet providers
const DelegationChecker: React.FC = () => {
  // Network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Devnet;

  // You can also provide a custom RPC endpoint
  const endpoint = useMemo(() => 'https://api.devnet.solana.com', []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <DelegationCheckerInner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default DelegationChecker;

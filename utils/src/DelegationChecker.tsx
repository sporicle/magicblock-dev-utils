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
  const [formState, setFormState] = useState<FormState>({
    accountPubkey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    rpcUrl: ''
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DelegationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formState.accountPubkey.trim()) {
      setError('Please enter an account public key');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const delegationResult = await checkDelegation(
        formState.accountPubkey.trim(),
        formState.rpcUrl.trim() || undefined
      );
      setResult(delegationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setResult(null);
    setError(null);
    setPingResult(null);
    setPingError(null);
  };

  const handlePingTransaction = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setPingError('Please connect your wallet first');
      return;
    }

    if (!formState.accountPubkey.trim()) {
      setPingError('Please enter an account public key first');
      return;
    }

    setPingLoading(true);
    setPingError(null);
    setPingResult(null);

    try {
      const targetPubkey = new PublicKey(formState.accountPubkey.trim());
      const rpcUrl = formState.rpcUrl.trim() || DEFAULT_RPC_URL;
      const connection = new Connection(rpcUrl, 'confirmed');

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

  // Styles
  const containerStyle: React.CSSProperties = {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    maxWidth: '900px',
    margin: '0 auto',
    padding: '30px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e2e8f0'
  };

  const titleStyle: React.CSSProperties = {
    color: '#333',
    textAlign: 'center',
    marginBottom: '30px',
    fontSize: '2rem'
  };

  const formGroupStyle: React.CSSProperties = {
    marginBottom: '20px'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 600,
    color: '#555'
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px',
    border: '2px solid #e1e5e9',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'border-color 0.3s ease'
  };

  const buttonGroupStyle: React.CSSProperties = {
    display: 'flex',
    gap: '10px',
    marginBottom: '30px'
  };

  const buttonStyle: React.CSSProperties = {
    flex: 1,
    padding: '12px 24px',
    background: loading ? '#e2e8f0' : '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: loading ? 'none' : '0 2px 4px rgba(79, 70, 229, 0.2)'
  };

  const loadingStyle: React.CSSProperties = {
    textAlign: 'center',
    color: '#4f46e5',
    fontWeight: 600,
    margin: '20px 0'
  };

  const resultStyle: React.CSSProperties = {
    marginTop: '30px',
    padding: '20px',
    borderRadius: '8px',
    border: '2px solid'
  };

  const successResultStyle: React.CSSProperties = {
    ...resultStyle,
    backgroundColor: '#f0fdf4',
    borderColor: '#22c55e',
    border: '2px solid #22c55e'
  };

  const notDelegatedResultStyle: React.CSSProperties = {
    ...resultStyle,
    backgroundColor: '#fefce8',
    borderColor: '#eab308',
    border: '2px solid #eab308'
  };

  const errorResultStyle: React.CSSProperties = {
    ...resultStyle,
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
    border: '2px solid #ef4444'
  };

  const statusStyle: React.CSSProperties = {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    marginBottom: '15px'
  };

  const detailsStyle: React.CSSProperties = {
    backgroundColor: '#f7fafc',
    padding: '15px',
    borderRadius: '6px',
    margin: '15px 0',
    border: '1px solid #e2e8f0'
  };

  const detailsHeaderStyle: React.CSSProperties = {
    margin: '0 0 10px 0',
    color: '#2d3748'
  };

  const codeStyle: React.CSSProperties = {
    fontFamily: "'Courier New', monospace",
    wordBreak: 'break-all',
    margin: '5px 0',
    color: '#374151',
    fontSize: '14px'
  };

  const apiExampleStyle: React.CSSProperties = {
    backgroundColor: '#1a202c',
    color: '#e2e8f0',
    padding: '15px',
    borderRadius: '6px',
    margin: '15px 0',
    fontFamily: "'Courier New', monospace",
    fontSize: '12px',
    overflowX: 'auto'
  };

  const defaultExampleStyle: React.CSSProperties = {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    borderLeft: '4px solid #4f46e5',
    border: '1px solid #e2e8f0'
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>🪄 Magic Router Delegation Checker</h1>
      
      <form onSubmit={handleSubmit}>
        <div style={formGroupStyle}>
          <label style={labelStyle} htmlFor="accountPubkey">Account Public Key:</label>
          <input
            style={inputStyle}
            type="text"
            id="accountPubkey"
            name="accountPubkey"
            placeholder="Enter Solana account public key"
            value={formState.accountPubkey}
            onChange={handleInputChange}
            required
          />
        </div>
        
        <div style={formGroupStyle}>
          <label style={labelStyle} htmlFor="rpcUrl">RPC URL (Optional):</label>
          <input
            style={inputStyle}
            type="url"
            id="rpcUrl"
            name="rpcUrl"
            placeholder="https://rpc.ironforge.network/devnet?apiKey=..."
            value={formState.rpcUrl}
            onChange={handleInputChange}
          />
        </div>
        
        <div style={buttonGroupStyle}>
          <button type="submit" style={buttonStyle} disabled={loading}>
            Check Delegation Status
          </button>
          <button type="button" style={buttonStyle} onClick={clearResults} disabled={loading}>
            Clear Results
          </button>
        </div>
      </form>

      {/* Wallet Connection Section */}
      <div style={{
        ...formGroupStyle, 
        textAlign: 'center', 
        marginTop: '30px', 
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        border: '1px solid #e2e8f0'
      }}>
        <h3 style={{marginBottom: '15px', color: '#374151', fontSize: '18px'}}>🔗 Wallet Connection</h3>
        <WalletMultiButton />
        {connected && publicKey && (
          <p style={{marginTop: '12px', fontSize: '14px', color: '#059669', fontWeight: '500'}}>
            ✅ Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
          </p>
        )}
      </div>

      {/* Ping Transaction Section */}
      <div style={buttonGroupStyle}>
        <button 
          type="button" 
          style={{
            ...buttonStyle,
            background: (!connected || pingLoading) ? '#e2e8f0' : '#f59e0b',
            boxShadow: (!connected || pingLoading) ? 'none' : '0 2px 4px rgba(245, 158, 11, 0.2)',
            cursor: (!connected || pingLoading) ? 'not-allowed' : 'pointer'
          }} 
          onClick={handlePingTransaction} 
          disabled={!connected || pingLoading || loading}
        >
          {pingLoading ? '🔄 Sending Ping...' : '🏓 Send No-Op Ping Transaction'}
        </button>
      </div>

      {/* Ping Results */}
      {pingError && (
        <div style={errorResultStyle}>
          <div style={{...statusStyle, color: '#dc2626'}}>❌ Ping Error</div>
          <p><strong>Error:</strong> {pingError}</p>
        </div>
      )}

      {pingResult && (
        <div style={successResultStyle}>
          <div style={{...statusStyle, color: '#16a34a'}}>✅ Ping Transaction Sent</div>
          <div style={detailsStyle}>
            <h3 style={detailsHeaderStyle}>Transaction Details</h3>
            <p style={codeStyle}><strong>Signature:</strong> {pingResult}</p>
            <p style={codeStyle}><strong>From:</strong> {publicKey?.toString()}</p>
            <p style={codeStyle}><strong>To:</strong> {formState.accountPubkey}</p>
            <p style={codeStyle}><strong>Amount:</strong> 0 SOL (no-op transaction)</p>
            <p style={codeStyle}><strong>RPC URL:</strong> {formState.rpcUrl || DEFAULT_RPC_URL}</p>
          </div>
        </div>
      )}
      
      <div style={defaultExampleStyle}>
        <strong>💡 Try the default example:</strong> The pre-filled account key above is a test account. Click "Check Delegation Status" to see how it works!
      </div>
      
      {loading && (
        <div style={loadingStyle}>
          🔄 Checking delegation status...
        </div>
      )}
      
      {error && (
        <div style={errorResultStyle}>
          <div style={{...statusStyle, color: '#dc2626'}}>❌ Error</div>
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}
      
      {result && (
        <div style={result.status === 'DELEGATED' ? successResultStyle : notDelegatedResultStyle}>
          <div style={{...statusStyle, color: result.status === 'DELEGATED' ? '#16a34a' : '#ca8a04'}}>
            {result.status === 'DELEGATED' ? '✅ Account is DELEGATED' : '❌ Account is NOT DELEGATED'}
          </div>
          
          <div style={detailsStyle}>
            <h3 style={detailsHeaderStyle}>Account Information</h3>
            <p style={codeStyle}><strong>Account:</strong> {result.accountPubkey}</p>
            <p style={codeStyle}><strong>Delegation PDA:</strong> {result.delegationPDA}</p>
            {result.validatorIdentity && (
              <p style={codeStyle}><strong>Validator Identity:</strong> {result.validatorIdentity}</p>
            )}
            {!result.validatorIdentity && (
              <p style={codeStyle}><strong>Status:</strong> No active delegation found</p>
            )}
          </div>
          
          {result.pdaAccount && (
            <div style={detailsStyle}>
              <h3 style={detailsHeaderStyle}>PDA Account Details</h3>
              <p style={codeStyle}><strong>Lamports:</strong> {result.pdaAccount.lamports}</p>
              <p style={codeStyle}><strong>Owner:</strong> {result.pdaAccount.owner}</p>
              <p style={codeStyle}><strong>Data Length:</strong> {result.pdaAccount.dataLength} bytes</p>
              <p style={codeStyle}><strong>Executable:</strong> {result.pdaAccount.executable.toString()}</p>
              <p style={codeStyle}><strong>Rent Epoch:</strong> {result.pdaAccount.rentEpoch}</p>
            </div>
          )}
          
          <div style={detailsStyle}>
            <h3 style={detailsHeaderStyle}>🎯 Magic Router API Usage</h3>
            <div style={apiExampleStyle}>
{`curl -X POST "https://api.magicrouter.com/getAccountInfo" \\
  -H "Content-Type: application/json" \\
  -d '{"pubkey": "${result.accountPubkey}"}'

# This request will be ${result.status === 'DELEGATED' 
  ? 'automatically routed to the ephemeral rollup node'
  : 'routed to the base Solana chain'}`}
            </div>
          </div>
        </div>
      )}
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

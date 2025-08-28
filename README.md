# Magic Router Delegation Scripts

A comprehensive set of TypeScript scripts for querying and decoding delegation PDA (Program Derived Address) accounts in Solana-based Magic Router systems. The delegation system intelligently routes requests to either ephemeral rollup nodes (if delegated) or the base Solana chain (if not delegated).

## 🎯 Overview

Magic Router uses a delegation system to optimize transaction routing:
- **Delegated accounts**: Routed to high-performance ephemeral rollup nodes
- **Non-delegated accounts**: Routed to the base Solana chain
- **Transparent routing**: No changes required to existing client code

## 📁 Files Description

| File | Purpose | Environment |
|------|---------|-------------|
| `check_delegation.ts` | Core TypeScript module with delegation logic | Node.js/Browser |
| `example.html` | Complete HTML interface for immediate testing | Browser |
| `DelegationChecker.tsx` | Reusable React component | React Apps |
| `package.json` | Dependencies and scripts configuration | Node.js |
| `README.md` | This documentation file | Documentation |

## 🚀 Usage Examples

### Node.js CLI

```bash
# Install dependencies
npm install

# Check single account
npx ts-node check_delegation.ts 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM

# Check with custom RPC URL
npx ts-node check_delegation.ts 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM https://api.devnet.solana.com

# Build TypeScript to JavaScript
npm run build
```

### Browser Interface

1. Open `example.html` in any modern web browser
2. Enter a Solana account public key (default example provided)
3. Optionally specify a custom RPC URL
4. Click "Check Delegation Status"

### React Component

```tsx
import DelegationChecker from './DelegationChecker';

function App() {
  return (
    <div>
      <DelegationChecker />
    </div>
  );
}
```

### Programmatic Usage

```typescript
import { checkDelegation, checkMultipleDelegations } from './check_delegation';

// Single account check
const result = await checkDelegation('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
console.log(result.status); // 'DELEGATED' or 'NOT_DELEGATED'

// Multiple accounts check
const accounts = [
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  'AnotherAccountPublicKeyHere...'
];
const results = await checkMultipleDelegations(accounts);
```

## 🔧 Understanding Delegation

### Delegation Program

- **Program ID**: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`
- **Network**: Solana Devnet (configurable)
- **Purpose**: Manages account delegation records

### PDA Derivation Logic

```typescript
// Seeds: ["delegation", account_pubkey_bytes]
// Program: DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh
function getDelegationRecordPDA(accountPubkey: PublicKey): PublicKey {
  const delegationProgram = new PublicKey(DELEGATION_PROGRAM_STR);
  const seeds = [Buffer.from("delegation", "utf8"), accountPubkey.toBuffer()];
  const [pda] = PublicKey.findProgramAddressSync(seeds, delegationProgram);
  return pda;
}
```

### Record Structure (96 bytes)

| Bytes | Content | Description |
|-------|---------|-------------|
| 0-7   | Discriminator | Program-specific identifier |
| 8-39  | Validator Identity | 32-byte public key |
| 40-95 | Metadata | Additional delegation data |

### Delegation Status Logic

```typescript
// Status determination:
if (!pdaAccount || pdaAccount.lamports === 0) {
  return 'NOT_DELEGATED';
}

if (validIdentityExtracted) {
  return 'DELEGATED';
}

return 'NOT_DELEGATED';
```

## 🌐 Magic Router Integration

### How Routing Works

1. **Client Request**: Standard Solana RPC call
2. **Delegation Check**: Magic Router queries delegation PDA
3. **Route Decision**: 
   - Delegated → Ephemeral rollup node
   - Not delegated → Base Solana chain
4. **Response**: Transparent to client

### API Examples

#### Standard Account Info Request
```bash
curl -X POST "https://api.magicrouter.com/getAccountInfo" \
  -H "Content-Type: application/json" \
  -d '{"pubkey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"}'
```

#### Multiple Account Requests
```bash
curl -X POST "https://api.magicrouter.com/getMultipleAccounts" \
  -H "Content-Type: application/json" \
  -d '{
    "pubkeys": [
      "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      "AnotherAccountHere..."
    ]
  }'
```

#### Get Routes Information
```bash
curl -X GET "https://api.magicrouter.com/getRoutes"
```

#### Get Validator Identity
```bash
curl -X POST "https://api.magicrouter.com/getIdentity" \
  -H "Content-Type: application/json" \
  -d '{"pubkey": "ValidatorPublicKeyHere..."}'
```

## ⚙️ Configuration

### Default RPC URL

The default RPC URL is configured for Solana Devnet:

```typescript
const DEFAULT_RPC_URL = "https://rpc.ironforge.network/devnet?apiKey=01HBGMPGFMCPPFCXDZ43Y1K80K";
```

### Changing RPC Configuration

**Environment Variable** (Node.js):
```bash
export SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
```

**Function Parameter**:
```typescript
await checkDelegation(pubkey, "https://api.mainnet-beta.solana.com");
```

**HTML Form**: Use the RPC URL input field

## 🔍 API Response Format

```typescript
interface DelegationResult {
  accountPubkey: string;           // Original account key
  delegationPDA: string;           // Computed PDA address
  status: 'DELEGATED' | 'NOT_DELEGATED';
  validatorIdentity?: string;      // Validator public key (if delegated)
  pdaAccount?: {                   // PDA account details (if exists)
    lamports: number;
    owner: string;
    dataLength: number;
    executable: boolean;
    rentEpoch: number;
  };
  rawData?: {                      // Raw delegation data (if delegated)
    discriminator: number[];       // Bytes 0-7
    identityBytes: number[];       // Bytes 8-39
  };
}
```

## 🛠️ Troubleshooting

### Common Issues

**Invalid Public Key Format**
```
Error: Invalid public key input
Solution: Ensure the key is a valid base58-encoded Solana public key (44 characters)
```

**Network/RPC Errors**
```
Error: Failed to connect to RPC endpoint
Solution: Check network connectivity and RPC URL validity
```

**Malformed Delegation Record**
```
Error: Could not extract valid validator identity
Solution: The PDA exists but contains invalid data - account may not be properly delegated
```

**Missing PDA Account**
```
Status: NOT_DELEGATED
Reason: No delegation record found for this account
```

### Debug Mode

Enable verbose logging in Node.js:

```bash
DEBUG=* npx ts-node check_delegation.ts <pubkey>
```

Or add console logging in the browser developer tools.

### Rate Limiting

If you encounter rate limiting:

1. Use a different RPC endpoint
2. Add delays between requests
3. Consider using a paid RPC service

## 🌍 Browser Compatibility

- **Supported**: Modern browsers with ES2020+ support
- **Requirements**: JavaScript enabled
- **Dependencies**: Solana Web3.js (loaded from CDN)
- **Build Process**: None required for HTML example

### Polyfills

The HTML example includes Buffer polyfill through Solana Web3.js CDN. For custom implementations, you may need:

```html
<script src="https://unpkg.com/buffer@6/index.js"></script>
```

## 📚 Additional Resources

- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Solana Program Library](https://spl.solana.com/)
- [Magic Router Documentation](https://docs.magicrouter.com/)
- [Solana Devnet Explorer](https://explorer.solana.com/?cluster=devnet)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Note**: This tool is designed for Solana Devnet by default. For Mainnet usage, update the RPC URL and ensure you have appropriate API access.

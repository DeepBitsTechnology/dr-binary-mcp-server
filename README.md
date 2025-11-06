# MCP DeepBits Server

An MCP (Model Context Protocol) server for DeepBits integration with OAuth authentication support.

## Features

- OAuth 2.0 authentication via DeepBits
- Proxy authentication provider
- Remote tool execution with file upload support
- Express-based HTTP server
- TypeScript support

## Installation

### Via npx (Recommended)

```bash
npx mcp-deepbits-server
```

### Global Installation

```bash
npm install -g mcp-deepbits-server
mcp-deepbits-server
```

### Local Development

```bash
git clone <repository-url>
cd mcp-deepbits-server
pnpm install
pnpm dev
```

## Usage

### Running the Server

The server will start on port 3000 by default. You can override this with the `PORT` environment variable:

```bash
PORT=8080 npx mcp-deepbits-server
```

### Claude Code Integration

To use this MCP server with Claude Code, add the following to your Claude Code configuration:

```json
{
    "mcpServers": {
        "drbinary": {
            "type": "http",
            "url": "http://localhost:3000/mcp"
        }
    }
}
```

## Configuration

The server uses the following configuration:

- **Authorization URL**: `https://login.deepbits.com/authorize`
- **Token URL**: `https://login.deepbits.com/oauth/token`
- **Revocation URL**: `https://login.deepbits.com/oauth/revoke`
- **MCP Endpoint**: `http://localhost:3000/mcp`
- **OAuth Metadata**: Available at `/.well-known/oauth-protected-resource`

### Required Scopes

- `openid`
- `profile`
- `email`
- `offline_access` (optional)

## Development

### Build

```bash
pnpm build
```

### Run in Development Mode

```bash
pnpm dev
```

### Start Production Server

```bash
pnpm start
```

## API Endpoints

### MCP Endpoint

- **URL**: `/mcp`
- **Method**: `POST`
- **Authentication**: Bearer token required
- **Description**: Main MCP server endpoint for tool execution

### OAuth Metadata

- **URL**: `/.well-known/oauth-protected-resource`
- **Method**: `GET`
- **Description**: OAuth 2.0 protected resource metadata

## Project Structure

```
mcp-deepbits-server/
├── bin/
│   └── run.js              # Executable entry point for npx
├── src/
│   └── index.ts            # Main server implementation
├── dist/                   # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Requirements

- Node.js >= 18.0.0
- npm, pnpm, or yarn

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

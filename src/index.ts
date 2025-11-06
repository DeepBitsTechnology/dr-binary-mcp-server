import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthMetadataRouter, mcpAuthRouter, createOAuthMetadata, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { jsonSchemaToZod } from "json-schema-to-zod";
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Create an MCP server
const server = new McpServer({
    name: 'deepbits-mcp-server',
    version: '1.0.0'
});

const proxyProvider = new ProxyOAuthServerProvider({
    endpoints: {
        authorizationUrl: 'https://login.deepbits.com/authorize',
        tokenUrl: 'https://login.deepbits.com/oauth/token',
        revocationUrl: 'https://login.deepbits.com/oauth/revoke'
    },
    verifyAccessToken: async token => {
        const [header, payload, signature] = token.split('.');
        const decodedHeader = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
        if (decodedHeader.typ !== 'JWT') {
            throw new Error('Invalid token type');
        }
        return {
            token,
            clientId: decodedPayload.client_id,
            scopes: decodedPayload.scope.split(' '),
            expiresAt: decodedPayload.exp,
        };
    },
    getClient: async client_id => {
        return {
            client_id,
            redirect_uris: ['http://localhost:3000/callback']
        };
    }
});


// Set up Express and HTTP transport
const app = express();
app.use(express.json());

app.use(mcpAuthMetadataRouter({
    oauthMetadata: createOAuthMetadata({
        provider: proxyProvider,
        issuerUrl: new URL('https://mcp.deepbits.com'),
        scopesSupported: ['openid', 'profile', 'email', 'offline_access'],
    }),
    resourceServerUrl: new URL('http://localhost:3000/mcp'),
    scopesSupported: ['openid', 'profile', 'email', 'offline_access'],
}));

const authMiddleware = requireBearerAuth({
    verifier: proxyProvider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL('http://localhost:3000/mcp'))
});

let client: Client | undefined;
const localToRemotePathMap = new Map<string, string>();

async function initializeClient(authorization: string) {
    const clientTransport = new StreamableHTTPClientTransport(new URL("https://mcp.deepbits.com/mcp"), {
        requestInit: {
            headers: {
                'Authorization': authorization
            }
        }
    });
    client = new Client({
        name: 'deepbits-mcp-client',
        version: '1.0.0'
    });
    await client.connect(clientTransport);
    return clientTransport;
}

async function initialize(authorization: string) {
    await initializeClient(authorization);
    if (!client) {
        throw new Error('Failed to initialize client');
    }
    const tools = await client.listTools();
    const { z } = await import('zod');
    for (const tool of tools.tools) {
        if (tool.name.startsWith('sandbox_') || tool.name.startsWith('workspace_')) {
            continue;
        }
        const inputSchema = eval(jsonSchemaToZod(tool.inputSchema as any));
        server.registerTool(tool.name, {
            title: tool.title,
            description: tool.description,
            inputSchema: inputSchema.shape as any,
        }, (async (args: any, extra: any) => {
            const localPath = args.filepath;
            if (tool.name === 'ghidra_open_server') {
                const data = new FormData();
                data.append('file', fs.createReadStream(localPath));
                const response = await fetch('https://mcp.deepbits.com/workspace/upload', {
                    method: 'POST',
                    body: data,
                    headers: {
                        ...data.getHeaders(),
                        'Authorization': `Bearer ${extra.authInfo?.token || ''}`,
                    },
                });
                const responseJson = await response.json() as any;
                localToRemotePathMap.set(localPath, `/sandbox/${responseJson.pathname}`);
            }
            if (localPath !== undefined) {
                const remotePath = localToRemotePathMap.get(localPath);
                if (remotePath) {
                    args.filepath = remotePath;
                }
            }
            if (!client) {
                throw new Error('Client not initialized');
            }
            return await client.callTool({
                name: tool.name,
                arguments: args,
            }, undefined, {
                timeout: 1000 * 60 * 60,
                maxTotalTimeout: 1000 * 60 * 60,
                signal: extra.signal,
            });
        }) as any)
    }
}

app.all('/mcp', authMiddleware, async (req, res) => {
    // Create a new transport for each request to prevent request ID collisions
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: false,
        });

        if (!client) {
            await initialize(req.headers.authorization || '');
        }
        res.on('close', async () => {
            await transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
    console.log(`Dr. Binary MCP Server running on http://localhost:${port}/mcp`);
}).on('error', error => {
    console.error('Server error:', error);
    process.exit(1);
});

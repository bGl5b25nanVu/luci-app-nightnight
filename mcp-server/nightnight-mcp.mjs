#!/usr/bin/env node
/**
 * NightNight OpenWrt MCP Server (Stdio <-> Router CGI MCP Endpoint)
 * Compatible with Antigravity, Claude Desktop, Claude Code, and Cursor.
 */

import readline from "node:readline";

const ROUTER_MCP_URL = process.env.NIGHTNIGHT_URL || "http://192.168.8.1/cgi-bin/nightnight-api?action=mcp";

const TOOLS = [
	{
		name: "nightnight_overview",
		description: "获取 OpenWrt 路由器实时流量拓扑概览、在用设备、去向分类及异常告警",
		inputSchema: {
			type: "object",
			properties: {}
		}
	},
	{
		name: "nightnight_suspicious_uploads",
		description: "查询路由器审计发现的可疑上传行为（如大额单条连接上传、输入法/云存储可疑上传、夜间静默上传、未加密明文传输等）",
		inputSchema: {
			type: "object",
			properties: {
				min_score: {
					type: "number",
					description: "最低可疑评分阈值，默认 15"
				}
			}
		}
	},
	{
		name: "nightnight_inspect_host",
		description: "查网站：深入分析某个主机名/域名的历史流量特征（上传/下载、最大单次连接、夜间上传、活跃小时数及自然语言行为画像“它在干什么？”）",
		inputSchema: {
			type: "object",
			properties: {
				host: {
					type: "string",
					description: "要查询的域名或主机名关键字，例如 wxkb 或 googleapis.com"
				},
				device: {
					type: "string",
					description: "可选设备 IP 过滤，默认 all"
				}
			},
			required: ["host"]
		}
	},
	{
		name: "nightnight_group_hosts",
		description: "列出某个去向分类（如 wechat, tencent, google, openai, alibaba, apple, unknown 或 all）下的所有主机名明细，按上传流量降序排列",
		inputSchema: {
			type: "object",
			properties: {
				group_id: {
					type: "string",
					description: "去向分类 ID（如 wechat, tencent, google, openai, all）"
				}
			}
		}
	}
];

process.stdout.on("error", (err) => {
	if (err.code === "EPIPE") process.exit(0);
});

function send(obj) {
	process.stdout.write(JSON.stringify(obj) + "\n");
}

const rl = readline.createInterface({
	input: process.stdin,
	terminal: false
});

rl.on("line", async (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;
	let req;
	try {
		req = JSON.parse(trimmed);
	} catch {
		return;
	}

	// Ignore JSON-RPC notifications (no id)
	if (req.id === undefined || req.id === null) {
		return;
	}

	const { id, method, params } = req;

	if (method === "initialize") {
		const clientVersion = (params && params.protocolVersion) || "2024-11-05";
		send({
			jsonrpc: "2.0",
			id,
			result: {
				protocolVersion: clientVersion,
				capabilities: {
					tools: {}
				},
				serverInfo: {
					name: "nightnight-openwrt",
					version: "0.6.0"
				}
			}
		});
		return;
	}

	if (method === "ping") {
		send({ jsonrpc: "2.0", id, result: {} });
		return;
	}

	if (method === "tools/list") {
		send({
			jsonrpc: "2.0",
			id,
			result: { tools: TOOLS }
		});
		return;
	}

	if (method === "resources/list") {
		send({
			jsonrpc: "2.0",
			id,
			result: { resources: [] }
		});
		return;
	}

	if (method === "resources/templates/list") {
		send({
			jsonrpc: "2.0",
			id,
			result: { resourceTemplates: [] }
		});
		return;
	}

	if (method === "prompts/list") {
		send({
			jsonrpc: "2.0",
			id,
			result: { prompts: [] }
		});
		return;
	}

	if (method === "tools/call") {
		try {
			const res = await fetch(ROUTER_MCP_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(req),
				signal: AbortSignal.timeout(8000)
			});
			const data = await res.json();
			send(data);
		} catch (err) {
			send({
				jsonrpc: "2.0",
				id,
				result: {
					isError: true,
					content: [
						{
							type: "text",
							text: `无法连接路由器 NightNight 接口 (${ROUTER_MCP_URL}): ${err.message}`
						}
					]
				}
			});
		}
		return;
	}

	send({
		jsonrpc: "2.0",
		id,
		error: {
			code: -32601,
			message: `Method not found: ${method}`
		}
	});
});

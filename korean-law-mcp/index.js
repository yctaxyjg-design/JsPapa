import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const OC = process.env.OC || "";
const PORT = process.env.PORT || 8080;
const LAW_API = "http://www.law.go.kr/DRF";

async function callLawApi(path, params) {
  if (!OC) throw new Error("OC 환경변수가 설정되지 않았습니다.");
  const url = new URL(`${LAW_API}/${path}`);
  url.searchParams.set("OC", OC);
  url.searchParams.set("type", "JSON");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  return res.json();
}

function createServer() {
  const server = new McpServer({
    name: "korean-law-mcp",
    version: "1.0.0",
  });

  server.tool(
    "search_law",
    "법령명 또는 키워드로 법령을 검색합니다.",
    {
      query: z.string().describe("검색 키워드 (예: 지방세특례제한법)"),
      page: z.number().optional().default(1).describe("페이지 번호"),
      display: z.number().optional().default(10).describe("페이지당 결과 수 (최대 100)"),
    },
    async ({ query, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "law", query, page, display });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "get_law",
    "법령 ID(MST) 또는 법령명으로 법령 본문을 조회합니다.",
    {
      id: z.string().optional().describe("법령 MST ID"),
      name: z.string().optional().describe("법령명 (id 없을 때 사용)"),
    },
    async ({ id, name }) => {
      const params = id ? { ID: id } : { name };
      const data = await callLawApi("lawService.do", params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search_precedent",
    "키워드로 판례를 검색합니다.",
    {
      query: z.string().describe("검색 키워드"),
      page: z.number().optional().default(1),
      display: z.number().optional().default(10),
    },
    async ({ query, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "prec", query, page, display });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "search_ordinance",
    "행정규칙(고시·훈령·예규)을 검색합니다.",
    {
      query: z.string().describe("검색 키워드"),
      page: z.number().optional().default(1),
      display: z.number().optional().default(10),
    },
    async ({ query, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "ordin", query, page, display });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", transport: "streamable-http", endpoint: "/mcp", oc_configured: !!OC });
});

app.get("/", (_req, res) => {
  res.json({ name: "korean-law-mcp", status: "running", endpoint: "/mcp" });
});

app.all("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`Korean Law MCP 서버 기동: port ${PORT}`);
  console.log(`OC 키: ${OC ? "설정됨 (" + OC + ")" : "❌ 미설정 — OC 환경변수 필요"}`);
});

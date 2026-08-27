import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const OC = process.env.OC || process.env.LAW_OC || "";
const PORT = process.env.PORT || 8080;
const LAW_API = "http://www.law.go.kr/DRF";

// 법제처 API 호출 — XML 포맷 사용 (JSON 엔드포인트 불안정)
async function callLawApi(path, params) {
  if (!OC) throw new Error("OC(또는 LAW_OC) 환경변수가 설정되지 않았습니다.");
  const url = new URL(`${LAW_API}/${path}`);
  url.searchParams.set("OC", OC);
  url.searchParams.set("type", "XML");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`법제처 API HTTP ${res.status}`);
  return res.text();
}

// 법제처 검색은 기본이 제목 매칭이라 다어절 구를 넣으면 0건이 나온다.
// 툴 설명에 이 함정을 박아 호출부가 "DB에 없다"로 오해하지 않게 한다.
const 제목매칭_주의 =
  "⚠ 기본 검색범위는 제목이라 여러 낱말을 이어 붙이면 0건이 나온다. " +
  "0건이면 DB에 없다는 뜻이 아니라 제목이 안 맞은 것이니, " +
  "핵심어 하나로 줄이거나 search=2(본문검색)로 다시 조회할 것. " +
  "예: '양도소득 개인지방소득세 무신고가산세' → 0건, '개인지방소득세' → 26건.";

const 검색범위 = z
  .enum(["1", "2"])
  .optional()
  .describe("검색범위 (1=제목, 기본값 / 2=본문검색)");

function createServer() {
  const server = new McpServer({
    name: "korean-law-mcp",
    version: "1.1.0",
  });

  server.tool(
    "search_law",
    `법령명 또는 키워드로 법령을 검색합니다. ${제목매칭_주의}`,
    {
      query: z.string().describe("검색 키워드 (예: 지방세특례제한법)"),
      search: 검색범위,
      page: z.number().optional().default(1).describe("페이지 번호"),
      display: z.number().optional().default(10).describe("페이지당 결과 수 (최대 100)"),
    },
    async ({ query, search, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "law", query, search, page, display });
      return { content: [{ type: "text", text: data }] };
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
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "search_precedent",
    `키워드로 판례를 검색합니다. ${제목매칭_주의}`,
    {
      query: z.string().describe("검색 키워드"),
      search: 검색범위,
      page: z.number().optional().default(1),
      display: z.number().optional().default(10),
    },
    async ({ query, search, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "prec", query, search, page, display });
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "search_interpretation",
    "법제처 법령해석례(유권해석)를 검색합니다. " +
      "실려 있는 것은 법제처 법령해석총괄과의 해석례이며, " +
      "행안부 지방세운영과 개별 질의회신(예: 지방세운영과-1885)은 여기에 없다 — " +
      "그런 회신은 위택스·행안부 지방세 예규집을 직접 봐야 한다. " +
      `다만 행안부 「지방세관계법 운영 예규」 자체는 search_admin_rule로 조회된다. ${제목매칭_주의}`,
    {
      query: z.string().describe("검색 키워드 (예: 지방소득세)"),
      search: 검색범위,
      page: z.number().optional().default(1),
      display: z.number().optional().default(10),
    },
    async ({ query, search, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "expc", query, search, page, display });
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "get_interpretation",
    "법령해석례 일련번호로 해석례 전문을 조회합니다.",
    {
      id: z.string().describe("법령해석례 일련번호 (search_interpretation 결과의 ID)"),
    },
    async ({ id }) => {
      const data = await callLawApi("lawService.do", { target: "expc", ID: id });
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "search_admin_rule",
    "행정규칙(훈령·예규·고시·공고)을 검색합니다. " +
      "행안부 「지방세관계법 운영 예규」처럼 부처가 발령한 예규가 여기에 실린다. " +
      `knd로 종류를 좁힐 수 있다. ${제목매칭_주의}`,
    {
      query: z.string().describe("검색 키워드 (예: 지방세)"),
      knd: z
        .enum(["1", "2", "3", "4", "5"])
        .optional()
        .describe("행정규칙 종류 (1=훈령, 2=예규, 3=고시, 4=공고, 5=일반)"),
      search: 검색범위,
      page: z.number().optional().default(1),
      display: z.number().optional().default(10),
    },
    async ({ query, knd, search, page, display }) => {
      const data = await callLawApi("lawSearch.do", {
        target: "admrul",
        query,
        knd,
        search,
        page,
        display,
      });
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "get_admin_rule",
    "행정규칙 ID로 행정규칙 본문을 조회합니다.",
    {
      id: z.string().describe("행정규칙ID (search_admin_rule 결과의 ID)"),
    },
    async ({ id }) => {
      const data = await callLawApi("lawService.do", { target: "admrul", ID: id });
      return { content: [{ type: "text", text: data }] };
    }
  );

  server.tool(
    "search_ordinance",
    "자치법규(조례·규칙)를 검색합니다. 지자체 조례가 대상이며, " +
      "부처 훈령·예규·고시는 여기가 아니라 search_admin_rule을 쓸 것. " +
      `지역명을 함께 넣으면 정확도가 올라간다. ${제목매칭_주의}`,
    {
      query: z.string().describe("검색 키워드 (예: 경산시 지방세)"),
      search: 검색범위,
      page: z.number().optional().default(1),
      display: z.number().optional().default(10),
    },
    async ({ query, search, page, display }) => {
      const data = await callLawApi("lawSearch.do", { target: "ordin", query, search, page, display });
      return { content: [{ type: "text", text: data }] };
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

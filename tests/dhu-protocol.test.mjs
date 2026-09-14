import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSchoolScript, findSchoolScript } from "../lib/dhu-protocol.ts";

test("protocol inspection accepts only the school course script", () => {
  const base = "https://webproxy.dhu.edu.cn/https/abc123/dhu/selectcourse/toSH";
  assert.equal(findSchoolScript('<script src="../jsp/selectcourse/studentui/selecthome.js?vpn-7&amp;random=1"></script>', base),
    "https://webproxy.dhu.edu.cn/https/abc123/dhu/jsp/selectcourse/studentui/selecthome.js?vpn-7&random=1");
  assert.equal(findSchoolScript('<script src="/https/abc123/dhu/jsp/selectcourse/studentui/selecthome.js?vpn-7"></script>', base),
    "https://webproxy.dhu.edu.cn/https/abc123/dhu/jsp/selectcourse/studentui/selecthome.js?vpn-7");
  assert.equal(findSchoolScript('<script src="https://evil.example/dhu/jsp/selectcourse/studentui/selecthome.js"></script>', base), null);
});

test("protocol evidence identifies candidates but never marks them verified", async () => {
  const source = `function selectSubmit() { $.ajax({url:"/dhu/selectcourse/saveChoice", type:"POST",
    data:{courseCode:courseCode,buyMaterial:buyMaterial}}); }`;
  const result = await analyzeSchoolScript(source, 123);
  assert.equal(result.checkedAt, 123);
  assert.equal(result.postCallCount, 1);
  assert.deepEqual(result.endpointCandidates, ["/dhu/selectcourse/saveChoice"]);
  assert.deepEqual(result.fieldHints, ["buyMaterial", "courseCode"]);
  assert.equal(result.verified, false);
  await assert.rejects(analyzeSchoolScript("<html><title>登录</title></html>"), /不是可核验/);
});

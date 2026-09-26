const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidTopicUrl, normalizeTopicUrl, buildTopicJsonUrl } = require("../src/core/utils");

test("topic URLs are limited to the ValuePickr forum", () => {
    assert.equal(isValidTopicUrl("https://forum.valuepickr.com/t/tata-elxsi/236"), true);
    assert.equal(isValidTopicUrl("http://forum.valuepickr.com/t/tata-elxsi/236"), false);
    assert.equal(isValidTopicUrl("https://evil.example/t/tata-elxsi/236"), false);
    assert.equal(isValidTopicUrl("https://forum.valuepickr.com.evil.example/t/tata-elxsi/236"), false);
    assert.equal(isValidTopicUrl("https://forum.valuepickr.com@evil.example/t/tata-elxsi/236"), false);
    assert.equal(isValidTopicUrl("https://forum.valuepickr.com/latest"), false);
});

test("post links resolve to the topic JSON endpoint", () => {
    const url = "https://forum.valuepickr.com/t/tata-elxsi/236/42?source=chat";
    assert.equal(normalizeTopicUrl(url), "https://forum.valuepickr.com/t/tata-elxsi/236");
    assert.equal(buildTopicJsonUrl(url, 2), "https://forum.valuepickr.com/t/tata-elxsi/236.json?page=2");
});

// Simple test to verify the server can fetch and parse a ValuePickr thread
const axios = require("axios");

async function testFetch() {
    const url = "https://forum.valuepickr.com/t/ranjans-portfolio/45082";
    const jsonUrl = url + ".json";

    console.log("Testing fetch from:", jsonUrl);

    try {
        const response = await axios.get(jsonUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        });

        const data = response.data;
        console.log("✓ Successfully fetched data");
        console.log("  Title:", data.title);
        console.log("  Total posts:", data.posts_count);
        console.log("  Posts in first chunk:", data.post_stream.posts.length);

        // Test pagination
        if (data.posts_count > 20) {
            const page2Url = jsonUrl + "?page=2";
            console.log("\nTesting pagination:", page2Url);
            const page2Response = await axios.get(page2Url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json"
                }
            });
            console.log("✓ Successfully fetched page 2");
            console.log("  Posts in page 2:", page2Response.data.post_stream.posts.length);
        }

        console.log("\n✓ All tests passed! Server should work correctly.");

    } catch (error) {
        console.error("✗ Test failed:", error.message);
        process.exit(1);
    }
}

testFetch();

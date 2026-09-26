function textResponse(text, data = {}) {
    return {
        content: [{ type: "text", text }],
        structuredContent: { text, data },
    };
}

function errorResponse(text) {
    return {
        content: [{ type: "text", text }],
        isError: true,
    };
}

function objectResponse(obj) {
    return textResponse(JSON.stringify(obj, null, 2), obj);
}

function createToolHandlers({ threadService, searchService, jobService }) {
    async function callTool(request) {
        const name = request?.params?.name;
        const args = request?.params?.arguments || {};

        try {
            if (name === "read_forum_thread") {
                const result = await threadService.readForumThread(args);
                return textResponse(result.text, result.meta);
            }

            if (name === "search_forum") {
                const result = await searchService.searchForum(args);
                return textResponse(result.text, result.meta);
            }

            if (name === "search_within_thread") {
                const result = await threadService.searchWithinThread(args);
                return textResponse(result.text, result.meta);
            }

            if (name === "start_read_forum_thread_job") {
                const job = jobService.startReadForumThreadJob(args);
                return objectResponse(job);
            }

            if (name === "start_search_within_thread_job") {
                const job = jobService.startSearchWithinThreadJob(args);
                return objectResponse(job);
            }

            if (name === "get_job_status") {
                const status = jobService.getJobStatus(args.job_id);
                if (!status) {
                    return errorResponse(`Job not found: ${args.job_id}`);
                }

                return objectResponse(status);
            }

            if (name === "get_job_result") {
                const result = jobService.getJobResult(args.job_id);
                if (!result) {
                    return errorResponse(`Job not found: ${args.job_id}`);
                }

                if (!result.ready) {
                    return objectResponse(result);
                }

                return textResponse(result.result.text, { ...result.result.meta, status: result.status });
            }

            if (name === "cancel_job") {
                const cancellation = jobService.cancelJob(args.job_id);
                if (!cancellation) {
                    return errorResponse(`Job not found: ${args.job_id}`);
                }

                return objectResponse(cancellation);
            }

            return errorResponse(`Tool not found: ${name}`);
        } catch (error) {
            return errorResponse(error.message || "Unexpected error");
        }
    }

    return {
        callTool,
    };
}

module.exports = {
    createToolHandlers,
};

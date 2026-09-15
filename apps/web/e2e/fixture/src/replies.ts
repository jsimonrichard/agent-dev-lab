/** Unique echo chunks so the spec can see a partial stream before the settled reply. */
export const ECHO_FIRST_CHUNK = "ECHO_PARTIAL";
export const ECHO_SECOND_CHUNK = " ECHO_DONE";
export const ECHO_REPLY = `${ECHO_FIRST_CHUNK}${ECHO_SECOND_CHUNK}`;
export const ECHO_CHUNK_DELAY_MS = 400;

export const TOOL_LOOP_TOOL_NAME = "lookup";
export const TOOL_LOOP_DONE = "TOOL_LOOP_DONE";

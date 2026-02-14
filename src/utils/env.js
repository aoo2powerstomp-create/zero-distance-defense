export function isLocalhost() {
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export const DEBUG_ENABLED = isLocalhost();

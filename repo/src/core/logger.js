const LOG_LEVELS = Object.freeze({
    SILENT: 0,
    ERROR: 1,
    WARN: 2,
    NORMAL: 3,
    DETAIL: 4,
    DEBUG: 5
});

class SomniumLogger {
    static levels = LOG_LEVELS;
    static level = LOG_LEVELS.WARN;

    static setLevel(level) {
        if (
            !Number.isInteger(level) ||
            level < LOG_LEVELS.SILENT ||
            level > LOG_LEVELS.DEBUG
        ) {
            throw new RangeError(
                "Invalid Somnium logging level."
            );
        }

        this.level = level;
    }

    static getLevel() {
        return this.level;
    }

    static enabled(level) {
        return this.level >= level;
    }

    static error(scope, message, details = null) {
        if (!this.enabled(LOG_LEVELS.ERROR)) return;
        console.error(`[${scope}] ${message}`, details ?? "");
    }

    static warn(scope, message, details = null) {
        if (!this.enabled(LOG_LEVELS.WARN)) return;
        console.warn(`[${scope}] ${message}`, details ?? "");
    }

    static info(scope, message, details = null) {
        if (!this.enabled(LOG_LEVELS.NORMAL)) return;
        console.info(`[${scope}] ${message}`, details ?? "");
    }

    static detail(scope, message, details = null) {
        if (!this.enabled(LOG_LEVELS.DETAIL)) return;
        console.info(`[${scope}] ${message}`, details ?? "");
    }

    static debug(scope, message, details = null) {
        if (!this.enabled(LOG_LEVELS.DEBUG)) return;
        console.debug(`[${scope}] ${message}`, details ?? "");
    }
}

export { SomniumLogger, LOG_LEVELS };

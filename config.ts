export const defaultConfig = {
    logFilesPath: "./logs/",
    maxMissingDays: 7,
    dayGetLimit: Infinity,
    logIntervalMinutes: 10,
    minimumUptime: 0.02,
    selfMacAddress: "00:00:00:00:00:00",
    staticLogFiles: [] as string[],
    deviceNames: {
        ["00:00:00:00:00:00"]: "me"
    } as { [mac: string]: string | undefined },
}
export type Config = typeof defaultConfig;

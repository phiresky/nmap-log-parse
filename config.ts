export const defaultConfig = {
	// path of the log files relative to the index.html file
	logFilesPath: "./logs/",
	// scan backwards for 7 days before giving up when data is missing
	maxMissingDays: 7,
	// only get this many days before stopping
	dayGetLimit: Infinity,
	// must be set to the interval with which nmap is run in your crontab,
	// e.g. 10 if your crontab entry is "*/10 * * * ..."
	logIntervalMinutes: 10,
	// hide devices that are up less than 2% of the time
	minimumUptime: 0.02,
	selfMacAddress: "00:00:00:00:00:00",
	staticLogFiles: [] as string[],
	deviceNames: {
		["00:00:00:00:00:00"]: "me",
	} as { [mac: string]: string | undefined },
};
export type Config = typeof defaultConfig;

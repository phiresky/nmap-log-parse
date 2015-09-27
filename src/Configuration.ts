interface Configuration {
	// name of the file containing the nmap xml logs
	input: string,
	// map from mac address to readable names for GUI display
	macToName?: { [mac: string]: string };
	// map from host names to readable names for GUI display
	hostToName?: { [hostname: string]: string };
	// list of mac addresses to hide
	hide?: string[];
	// interval in minutes with which nmaplog.sh is called
	logInterval: number;
	// don't show in Graph if total time less than this (proportion of total time)
	ignoreLessThanPercent: number;
}

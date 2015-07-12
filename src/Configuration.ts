interface Configuration {
	// file containing the nmap xml logs
	input: string,
	macToName: { [mac: string]: string };
	hostToName: { [hostname: string]: string };
	// interval in minutes with which nmaplog.sh is called
	logInterval: number;
	// don't show in Graph if total time less than this (minutes)
	ignoreLessThan: number;
	// host name of logging device
	self: string;
}
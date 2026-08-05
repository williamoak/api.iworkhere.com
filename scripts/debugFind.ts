const allConfigs = [
  {
    "enabled": true,
    "middleware": "logging",
    "name": "joinaunion"
  }
];
const tenant = "joinaunion";
const loggingConfig = allConfigs.find((c: any) => c.name === tenant && c.middleware === 'logging');
console.log('Result:', loggingConfig);

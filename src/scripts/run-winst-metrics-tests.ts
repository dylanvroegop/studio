import { runWinstMetricsIntegrationTests } from '../lib/winst-metrics-v2.integration.test';
import { runWinstMetricsUnitTests } from '../lib/winst-metrics-v2.test';

function run(): void {
  runWinstMetricsUnitTests();
  runWinstMetricsIntegrationTests();
  // eslint-disable-next-line no-console
  console.log('Winst metrics tests geslaagd.');
}

run();

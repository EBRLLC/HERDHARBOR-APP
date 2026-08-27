"use strict";

import * as Sentry from "@sentry/browser";
import { createHerdHarborMonitoring } from "./herdharbor-monitoring-core.mjs";

(() => {
  const runtime = window;
  const config = runtime.HerdHarborMonitoringConfig || {};
  const monitoring = createHerdHarborMonitoring(Sentry, runtime);

  runtime.HerdHarborMonitoring = monitoring;

  try {
    monitoring.init(config);
    monitoring.installBrowserInstrumentation();
  } catch {
    // Monitoring is strictly optional. HerdHarbor must continue even if the
    // monitoring SDK or its configuration cannot initialize.
  }
})();

"use strict";

import * as Sentry from "@sentry/browser";
import { createHerdHarborMonitoring } from "./herdharbor-monitoring-core.mjs";
import { installMonitoringAdapters } from "./herdharbor-monitoring-instrumentation.mjs";
import { createPrivacySentryAdapter } from "./herdharbor-monitoring-privacy.mjs";

(() => {
  const runtime = window;
  const config = runtime.HerdHarborMonitoringConfig || {};
  const privacySentry = createPrivacySentryAdapter(Sentry);
  const monitoring = createHerdHarborMonitoring(privacySentry, runtime);

  runtime.HerdHarborMonitoring = monitoring;

  try {
    monitoring.init(config);
    monitoring.installBrowserInstrumentation();
    installMonitoringAdapters(monitoring, runtime);
  } catch {
    // Monitoring is strictly optional. HerdHarbor must continue even if the
    // monitoring SDK or its configuration cannot initialize.
  }
})();

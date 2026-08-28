(() => {
  "use strict";

  const release = Object.freeze({
    version: "1.5.1",
    buildId: "membership-review-1",
    build: "1.5.1-alpha-membership-review-1",
    featureFlags: Object.freeze({
      adminMemberManagementEnabled: true,
      juniorPlanEnabled: true,
      billingEnabled: false
    }),
    plans: Object.freeze({
      junior: Object.freeze({ label: "Junior", priceMonthly: 0, maxActiveAnimals: 5 }),
      founder: Object.freeze({ label: "Founder", priceMonthly: 7.99, maxActiveAnimals: null }),
      member: Object.freeze({ label: "Member", priceMonthly: 14.99, maxActiveAnimals: null }),
      business: Object.freeze({ label: "Business", priceMonthly: null, maxActiveAnimals: null, reserved: true })
    })
  });

  window.HerdHarborRelease = release;
  document.documentElement.dataset.herdharborVersion = release.version;
  document.documentElement.dataset.herdharborBuild = release.buildId;
})();

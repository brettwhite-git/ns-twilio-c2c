const SuiteCloudJestConfiguration = require('@oracle/suitecloud-unit-testing/jest-configuration/SuiteCloudJestConfiguration');

const config = SuiteCloudJestConfiguration.build({
    projectFolder: 'src',
    projectType: SuiteCloudJestConfiguration.ProjectType.SUITEAPP,
});

// N/llm is not provided by SuiteCloud stubs — use manual mock
config.moduleNameMapper['^N/llm$'] = '<rootDir>/__mocks__/llm.js';

module.exports = config;

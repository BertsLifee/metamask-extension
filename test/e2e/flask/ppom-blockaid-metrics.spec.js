const { strict: assert } = require('assert');
const FixtureBuilder = require('../fixture-builder');
const { mockServerJsonRpc } = require('../mock-server-json-rpc');

const {
  defaultGanacheOptions,
  // openDapp,
  unlockWallet,
  withFixtures,
  getEventPayloads,
} = require('../helpers');

// const bannerAlertSelector = '[data-testid="security-provider-banner-alert"]';

const selectedAddress = '0x5cfe73b6021e818b776b421b1c4db2474086a7e1';
const selectedAddressWithoutPrefix = '5cfe73b6021e818b776b421b1c4db2474086a7e1';

const CONTRACT_ADDRESS = {
  BalanceChecker: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
  FiatTokenV2_1: '0xa2327a938febf5fec13bacfb16ae10ecbc4cbdcf',
  OffChainOracle: '0x52cbe0f49ccdd4dc6e9c13bab024eabd2842045b',
  USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
};

/**
 * mocks the segment api multiple times for specific payloads that we expect to
 * see when these tests are run. In this case we are looking for
 * 'Transaction Submitted' and 'Transaction Finalized'. In addition on the
 * first event of each series we require a field that should only appear in the
 * anonymized events so that we can guarantee order of seenRequests and can
 * properly make assertions. Do not use the constants from the metrics
 * constants files, because if these change we want a strong indicator to our
 * data team that the shape of data will change.
 *
 * @param {import('mockttp').Mockttp} mockServer
 * @returns {Promise<import('mockttp/dist/pluggable-admin').MockttpClientResponse>[]}
 */

async function mockServerCalls(mockServer) {
  await mockServerJsonRpc(mockServer, [
    ['eth_blockNumber'],
    [
      'eth_call',
      {
        methodResultVariant: 'balanceChecker',
        params: [{ to: CONTRACT_ADDRESS.BalanceChecker }],
      },
    ],
    [
      'eth_call',
      {
        methodResultVariant: 'offchainOracle',
        params: [{ to: CONTRACT_ADDRESS.OffChainOracle }],
      },
    ],
    [
      'eth_call',
      {
        methodResultVariant: 'balance',
        params: [
          {
            accessList: [],
            data: `0x70a08231000000000000000000000000${selectedAddressWithoutPrefix}`,
            to: CONTRACT_ADDRESS.USDC,
          },
        ],
      },
    ],
    ['eth_estimateGas'],
    ['eth_gasPrice'],
    ['eth_getBalance'],
    ['eth_getBlockByNumber'],
    [
      'eth_getCode',
      {
        methodResultVariant: 'USDC',
        params: [CONTRACT_ADDRESS.USDC],
      },
    ],
  ]);

  await mockServer
    .forPost()
    .withJsonBodyIncluding({
      method: 'debug_traceCall',
      params: [{ accessList: [], data: '0x00000000' }],
    })
    .thenCallback((req) => {
      return {
        statusCode: 200,
        json: {
          jsonrpc: '2.0',
          id: req.body.json.id,
          result: {
            calls: [
              {
                error: 'execution reverted',
                from: CONTRACT_ADDRESS.USDC,
                gas: '0x1d55c2c7',
                gasUsed: '0xf0',
                input: '0x00000000',
                to: CONTRACT_ADDRESS.FiatTokenV2_1,
                type: 'DELEGATECALL',
                value: '0x0',
              },
            ],
            error: 'execution reverted',
            from: '0x0000000000000000000000000000000000000000',
            gas: '0x1dcd6500',
            gasUsed: '0x6f79',
            input: '0x00000000',
            to: CONTRACT_ADDRESS.USDC,
            type: 'CALL',
            value: '0x0',
          },
        },
      };
    });

  await mockServer
    .forPost()
    .withJsonBodyIncluding({
      method: 'debug_traceCall',
      params: [{ from: selectedAddress }],
    })
    .thenCallback((req) => {
      const mockFakePhishingAddress =
        '5fbdb2315678afecb367f032d93f642f64180aa3';

      return {
        statusCode: 200,
        json: {
          jsonrpc: '2.0',
          id: req.body.json.id,
          result: {
            calls: [
              {
                from: CONTRACT_ADDRESS.USDC,
                gas: '0x2923d',
                gasUsed: '0x4cac',
                input: `0xa9059cbb000000000000000000000000${mockFakePhishingAddress}0000000000000000000000000000000000000000000000000000000000000064`,
                logs: [
                  {
                    address: CONTRACT_ADDRESS.USDC,
                    data: '0x0000000000000000000000000000000000000000000000000000000000000064',
                    topics: [
                      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                      `0x000000000000000000000000${selectedAddressWithoutPrefix}`,
                      `0x000000000000000000000000${mockFakePhishingAddress}`,
                    ],
                  },
                ],
                output:
                  '0x0000000000000000000000000000000000000000000000000000000000000001',
                to: CONTRACT_ADDRESS.FiatTokenV2_1,
                type: 'DELEGATECALL',
                value: '0x0',
              },
            ],
            from: selectedAddress,
            gas: '0x30d40',
            gasUsed: '0xbd69',
            input: `0xa9059cbb000000000000000000000000${mockFakePhishingAddress}0000000000000000000000000000000000000000000000000000000000000064`,
            output:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
            to: CONTRACT_ADDRESS.USDC,
            type: 'CALL',
            value: '0x0',
          },
        },
      };
    });

  return [
    await mockServer
      .forPost('https://api.segment.io/v1/batch')
      .withJsonBodyIncluding({
        batch: [
          {
            type: 'track',
            event: 'Enabled/Disable Security Alerts',
            properties: {
              enabled: true,
              category: 'Settings',
            },
          },
        ],
      })
      .thenCallback(() => {
        return {
          statusCode: 200,
        };
      }),
    await mockServer
      .forPost('https://api.segment.io/v1/batch')
      .withJsonBodyIncluding({
        batch: [
          {
            type: 'track',
            event: 'Enabled/Disable Security Alerts',
            properties: {
              enabled: false,
              category: 'Settings',
            },
          },
        ],
      })
      .thenCallback(() => {
        return {
          statusCode: 200,
        };
      }),
  ];
}

describe('PPOM Blockaid Alert - Metrics', function () {
  it('Successfully track button toggle on/off', async function () {
    await withFixtures(
      {
        dapp: true,
        fixtures: new FixtureBuilder()
          .withNetworkControllerOnMainnet()
          .withPermissionControllerConnectedToTestDapp()
          .withMetaMetricsController({
            metaMetricsId: 'fake-metrics-id',
            participateInMetaMetrics: true,
          })
          .build(),
        ganacheOptions: defaultGanacheOptions,
        title: this.test.title,
        testSpecificMock: mockServerCalls,
      },
      async ({ driver, mockedEndpoint: mockedEndpoints }) => {
        await driver.navigate();
        await unlockWallet(driver);

        // toggle on
        await driver.clickElement(
          '[data-testid="account-options-menu-button"]',
        );
        await driver.clickElement({ text: 'Settings', tag: 'div' });
        await driver.clickElement({ text: 'Experimental', tag: 'div' });
        await driver.clickElement(
          '[data-testid="settings-toggle-security-alert-blockaid"] .toggle-button > div',
        );

        await driver.delay(1000);

        // toggle off
        await driver.clickElement(
          '[data-testid="account-options-menu-button"]',
        );
        await driver.clickElement({ text: 'Settings', tag: 'div' });
        await driver.clickElement({ text: 'Experimental', tag: 'div' });
        await driver.clickElement(
          '[data-testid="settings-toggle-security-alert-blockaid"] .toggle-button > div',
        );

        const events = await getEventPayloads(driver, mockedEndpoints);

        const toggleOnEvent = {
          event: 'Enabled/Disable Security Alerts',
          properties: {
            enabled: true,
            category: 'Settings',
          },
          userId: 'fake-metrics-id',
          type: 'track',
        };
        const matchToggleOnEvent = {
          event: events[0].event,
          properties: {
            enabled: events[0].properties.enabled,
            category: events[0].properties.category,
          },
          userId: events[0].userId,
          type: events[0].type,
        };

        const toggleOffEvent = {
          event: 'Enabled/Disable Security Alerts',
          properties: {
            enabled: false,
            category: 'Settings',
          },
          userId: 'fake-metrics-id',
          type: 'track',
        };
        const matchToggleOffEvent = {
          event: events[1].event,
          properties: {
            enabled: events[1].properties.enabled,
            category: events[1].properties.category,
          },
          userId: events[1].userId,
          type: events[1].type,
        };

        assert.deepStrictEqual(toggleOnEvent, matchToggleOnEvent);
        assert.deepStrictEqual(toggleOffEvent, matchToggleOffEvent);
      },
    );
  });

  // it('should show banner alert', async function () {
  //   await withFixtures(
  //     {
  //       dapp: true,
  //       fixtures: new FixtureBuilder()
  //         .withNetworkControllerOnMainnet()
  //         .withPermissionControllerConnectedToTestDapp()
  //         .withPreferencesController({
  //           securityAlertsEnabled: true,
  //         })
  //         .build(),
  //       defaultGanacheOptions,
  //       testSpecificMock: mockInfura,
  //       title: this.test.title,
  //     },

  //     async ({ driver }) => {
  //       const expectedTitle = 'This is a deceptive request';
  //       const expectedDescription =
  //         'If you approve this request, a third party known for scams will take all your assets.';

  //       await driver.navigate();
  //       await unlockWallet(driver);
  //       await openDapp(driver);

  //       // Click TestDapp button to send JSON-RPC request
  //       await driver.clickElement('#maliciousERC20TransferButton');

  //       // Wait for confirmation pop-up
  //       await driver.waitUntilXWindowHandles(3);
  //       await driver.switchToWindowWithTitle('MetaMask Notification');

  //       const bannerAlertFoundByTitle = await driver.findElement({
  //         css: bannerAlertSelector,
  //         text: expectedTitle,
  //       });
  //       const bannerAlertText = await bannerAlertFoundByTitle.getText();

  //       assert(
  //         bannerAlertFoundByTitle,
  //         `Banner alert not found. Expected Title: ${expectedTitle} \nExpected reason: transfer_farming\n`,
  //       );
  //       assert(
  //         bannerAlertText.includes(expectedDescription),
  //         `Unexpected banner alert description. Expected: ${expectedDescription} \nExpected reason: transfer_farming\n`,
  //       );
  //     },
  //   );
  // });
});

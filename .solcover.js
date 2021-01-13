module.exports = {
    providerOptions: {
        default_balance_ether: 100000000000000000000000000000000,
        total_accounts: 20,
    },
    skipFiles: ['sol4/', 'sol6/mock/', 'sol6/utils/zeppelin/'],
    istanbulReporter: ['html','json']
}

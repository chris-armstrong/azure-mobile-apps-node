// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ----------------------------------------------------------------------------
module.exports = function (connection) {
    // these require statements must appear within this function to avoid circular reference issues between dynamicSchema and schema
    var statements = require('./statements'),
        serialize = require('./serialize')(connection),
        dynamicSchema = require('./dynamicSchema'),
        columns = require('./columns')(connection),
        promises = require('../../utilities/promises'),
        log = require('../../logger');

    var api = {
        initialize: function (table) {
            return columns.for(table)
                .then(function (columns) {
                    if(columns.length === 0)
                        return api.createTable(table)
                            .catch(function (error) {
                                log.error("Error occurred creating table " + table.name + ":", error);
                                throw error;
                            });
                    else
                        return api.updateSchema(table);
                });
        },

        createTable: function(table, item) {
            log.info('Creating table ' + table.name);
            return columns.discover(table, item)
                .then(function (tableColumns) {
                    return serialize(statements.createTable(table, tableColumns))
                        .then(function () {
                            return serialize(statements.createTrigger(table));
                        })
                        .then(function () {
                            return api.createIndexes(table);
                        })
                        .then(function () {
                            return columns.set(table, tableColumns);
                        })
                        .then(function () {
                            return api.seedData(table);
                        });
                });
        },

        updateSchema: function(table, item) {
            log.info('Updating schema for table ' + table.name);
            return columns.for(table)
                .then(function (existingColumns) {
                    return columns.discover(table, item)
                        .then(function (allColumns) {
                            return serialize(statements.updateSchema(table, existingColumns, allColumns))
                                .then(function () {
                                    return api.createIndexes(table);
                                })
                                .then(function () {
                                    return columns.set(table, allColumns);
                                });
                        });
                });
        },

        createIndexes: function(table) {
            if(table.indexes) {
                if(Array.isArray(table.indexes)) {
                    log.info('Creating indexes for table ' + table.name);
                    return promises.all(
                        table.indexes.map(function (indexConfig) {
                            return serialize(statements.createIndex(table, indexConfig));
                        })
                    );
                } else {
                    throw new Error('Index configuration of table \'' + table.name + '\' should be an array containing either strings or arrays of strings.');
                }
            } else {
                return promises.resolved();
            }
        },

        seedData: function (table) {
            return promises.series(table.seed, insert);

            function insert(item) {
                return dynamicSchema(connection, table).execute(statements.insert(table, item), item);
            }
        },

        get: function (table) {
            return columns.for(table).then(function (columns) {
                return {
                    name: table.name,
                    properties: columns //.map(function (column) {
                    //     return {
                    //         name: column.name,
                    //         type: helpers.getColumnTypeFromSqlType(column.type)
                    //     };
                    // })
                };
            });
        }
    };
    return api;
}

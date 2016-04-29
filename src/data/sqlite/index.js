// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ----------------------------------------------------------------------------
var statements = require('./statements'),
    serializeModule = require('./serialize'),
    dynamicSchemaModule = require('./dynamicSchema'),
    schemaModule = require('./schema'),
    columnsModule = require('./columns'),
    connections = require('./connections'),
    log = require('../../logger'),
    assert = require('../../utilities/assert').argument,
    promises = require('../../utilities/promises'),
    queries = require('../../query'),
    uuid = require('node-uuid');

module.exports = function (configuration) {
    configuration = configuration || {};

    var connection = connections(configuration),
        serialize = serializeModule(connection);
    connection.serialize = serialize;

    var schema = schemaModule(connection),
        columns = columnsModule(connection);

    var tableAccess = function (table) {
        assert(table, 'A table was not specified');

        var dynamicSchema = dynamicSchemaModule(connection, table);

        // set execute functions based on dynamic schema and operation
        var read, update, insert, del;
        if (table.dynamicSchema !== false) {
            read = dynamicSchema.read;
            update = insert = del = dynamicSchema.execute;
        } else {
            read = update = insert = del = serialize;
        }

        return {
            read: function (query) {
                return loadColumns().then(function () {
                    query = query || queries.create(table.containerName);
                    return read(statements.read(query, table));
                });
            },
            update: function (item, query) {
                assert(item, 'An item to update was not provided');
                return loadColumns().then(function () {
                    return update(statements.update(table, item, query), item);
                });
            },
            insert: function (item) {
                assert(item, 'An item to insert was not provided');
                return loadColumns().then(function () {
                    item.id = item.id || uuid.v4();
                    return insert(statements.insert(table, item), item);
                });
            },
            delete: function (query, version) {
                assert(query, 'The delete query was not provided');
                return loadColumns().then(function () {
                    return del(statements.delete(table, query, version));
                });
            },
            undelete: function (query, version) {
                assert(query, 'The undelete query was not provided');
                return loadColumns().then(function () {
                    return del(statements.undelete(table, query, version));
                });
            },
            truncate: function () {
                return serialize(statements.truncate(table));
            },
            initialize: function () {
                return schema.initialize(table).catch(function (error) {
                    log.error('Error occurred during table initialization', error);
                    throw error;
                });
            },
            schema: function () {
                return schema.get(table);
            }
        };

        function loadColumns() {
            if(!table.sqliteColumns)
                return columns.for(table);
            return promises.resolved();
        }
    };

    // expose a method to allow direct execution of SQL queries
    tableAccess.execute = function (statement) {
        assert(statement, 'A SQL statement was not provided');
        return serialize(statement);
    };

    return tableAccess;
};

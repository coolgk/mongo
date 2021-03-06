/*!
 *  Copyright (c) 2017 Daniel Gong <daniel.k.gong@gmail.com>. All rights reserved.
 *  Licensed under the MIT License.
 */

import {
    Db, ObjectID, Cursor, Collection, FindOneOptions, CollectionInsertOneOptions, CollectionInsertManyOptions,
    InsertOneWriteOpResult, InsertWriteOpResult, FindOneAndReplaceOption, FindAndModifyWriteOpResultObject
} from 'mongodb';
import { toArray } from '@coolgk/array';

export { InsertOneWriteOpResult, InsertWriteOpResult };

export enum GeneratedField {
    DATE_MODIFIED = '_dateModified'
}

// model field data types
export enum DataType {
    STRING = 'string',
    BOOLEAN = 'bool',
    DATE = 'date',
    NUMBER = 'number',
    DOCUMENT = 'document',
    ENUM = 'enum',
    OBJECTID = 'objectId'
}

// model data schema
export interface IDataSchema {
    type: DataType;
    model?: typeof Mongo;
    schema?: ISchema;
    array?: boolean;
    // insert/update hooks
    setter?: (value: any, row: any) => any;
    default?: any;
    // validation properties
    enum?: any[];
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    minimum?: number | Date;
    maximum?: number | Date;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    pattern?: string;
}

// model schema
export interface ISchema {
    [field: string]: IDataSchema;
}

// query result
export interface IDocument {
    [field: string]: any;
}

export interface IProjection {
    [field: string]: 1 | 0;
}

// query join definition
export interface IJoin {
    on: string | string[];
    projection?: IProjection;
    filters?: IQuery;
    join?: IJoin[];
    data?: Cursor;
    model?: typeof Mongo;
}

// mongo query
export interface IQuery {
    [index: string]: any;
}

export interface IFindOptions extends FindOneOptions {
    join?: IJoin[];
    cursor?: boolean;
}

export interface IOptions {
    db: Db;
}

// reference pointer to object id values found in a query result
interface IReferencePointer {
    parent: IDocument | IDocument[];
    field: string | number;
    path?: string[];
}

// object id values in search result
interface IObjectIdInData {
    [field: string]: IReferencePointer[];
}

// db validation schema
interface IJsonSchemaProperties {
    [field: string]: IJsonSchema;
}

// db validation schema
interface IJsonSchema {
    bsonType?: string | string[];
    required?: string[];
    enum?: any[];
    items?: IJsonSchema | IJsonSchema[];
    properties?: IJsonSchemaProperties;
    additionalProperties?: boolean;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    maxLength?: number;
    minLength?: number;
    minimum?: number | Date;
    maximum?: number | Date;
    pattern?: string;
}

interface IUpdateQueryParent {
    arrayFilters: IQuery[];
    // fields: string[];
    path: string[];
}

interface IUpdateQueries {
    [action: string]: {
        values: IQuery;
        arrayFilters: IQuery[];
    };
}

export interface IUpdateResults {
    // [action: string]: any;
    value?: {
        [field: string]: any
    };
    raw: {
        [action: string]: any;
    };
    // error?: {
    //     [action: string]: any;
    // };
}

export interface IUpdateOption extends FindOneAndReplaceOption {
    revertOnError?: boolean;
    // noTransform?: boolean;
}

/**
 * One of the Error types thrown from this module
 * @export
 * @class MongoError
 * @extends {Error}
 */
export class MongoError extends Error { public data: any; }

/**
 * One of the Error types thrown from this module
 * @export
 * @class SchemaError
 * @extends {Error}
 */
export class SchemaError extends Error {} // tslint:disable-line

/**
 * @export
 * @class Mongo
 */
export class Mongo {

    /**
     * classes that extends this class must implement this static method to set the collection name of the model
     * @static
     * @returns {string} - the collection name of the model
     * @memberof Mongo
     */
    public static getCollectionName (): string {
        throw new MongoError('Undefined static method "getCollectionName"');
    }

    /**
     * classes that extends this class must implement this static method to set the schema of the model
     * @static
     * @returns {object} - model schema, see documentaion.
     * @memberof Mongo
     */
    public static getSchema (): ISchema {
        throw new MongoError('Undefined static method "getSchema"');
    }

    private _schema: ISchema = {};
    private _collection: Collection;
    private _db: Db;

    /* tslint:disable */
    /**
     * @param {object} options
     * @param {object} options.db - a Db instance from mongo node client e.g. the db variable in v3.x MongoClient.connect(url, (err, client) => { const db = client.db(dbName); ... }) v2.x MongoClient.connect(url, (err, db) => { ... })
     * @memberof Mongo
     */
    /* tslint:enable */
    constructor (options: IOptions) {
        this._db = options.db;
        this._schema = (this.constructor as typeof Mongo).getSchema();
        this._collection = this._db.collection((this.constructor as typeof Mongo).getCollectionName());
    }

    /**
     * @param {(object | string)} id - a string or an instance of ObjectID
     * @returns {(object | undefined)} - an ObjectID or undefined if "id" is not a valid ObjectID string
     * @memberof Mongo
     */
    public getObjectID (id: ObjectID | string): ObjectID | undefined {
        // https://jira.mongodb.org/browse/NODE-1146
        // 19 Feb 2018, mongo bug ObjectID.isValid(1) returns true
        // have to cast id to string first before this bug is fixed
        return ObjectID.isValid(String(id)) ? new ObjectID(id) : undefined;
    }

    /**
     * an alias of the getObjectID() method.
     */
    public getObjectId (id: ObjectID | string): ObjectID | undefined {
        return this.getObjectID(id);
    }

    /**
     * @returns {object} - returns the db instance passed into the constructor
     * @memberof Mongo
     */
    public getDb (): Db {
        return this._db;
    }

    /**
     * @returns {object} - mongo Collection insance of the current model
     * @memberof Mongo
     */
    public getCollection (): Collection {
        return this._collection;
    }

    /**
     * set validation schema in mongo
     * @returns {Promise<*>} - a promise returned from mongo's createCollection or collMod commands
     * @memberof Mongo
     */
    public async setDbValidationSchema (): Promise<any> {
        const collections = await this._db.collections();
        const collectionName = (this.constructor as typeof Mongo).getCollectionName();

        if (collections.find((collection) => collection.collectionName === collectionName)) {
            return this._db.command({ // https://docs.mongodb.com/manual/reference/command/collMod/
                collMod: collectionName,
                validator: {
                    $jsonSchema: this._getJsonSchema(this._schema)
                },
                validationLevel: 'strict',
                validationAction: 'error'
            });
        }

        return this._db.createCollection(collectionName, {
            validator: {
                $jsonSchema: this._getJsonSchema(this._schema)
            },
            validationLevel: 'strict',
            validationAction: 'error'
        });
    }

    /**
     * Insert One Document
     * @param {object} data - one document
     * @param {object} options - options of mongo's insertOne() function
     * @returns {Promise<object>} - returns the return value of mongo's insertOne() function
     * @memberof Mongo
     */
    public async insertOne (data: IDocument, options?: CollectionInsertOneOptions): Promise<InsertOneWriteOpResult> {
        // pass as array so it transforms _id and _dateModified value on the main doc
        await this._transform(toArray(data), { type: DataType.DOCUMENT, schema: this._schema, array: true });
        return this._collection.insertOne(data, options);
    }

    /**
     * Insert Mulitple Documents
     * @param {object[]} data - multiple documents
     * @param {object} options - options of mongo's insertMany() function
     * @returns {Promise<object>} - returns the return value of mongo's insertMany()
     * @memberof Mongo
     */
    public async insertMany (data: IDocument[], options?: CollectionInsertManyOptions): Promise<InsertWriteOpResult> {
        await this._transform(toArray(data), { type: DataType.DOCUMENT, schema: this._schema, array: true });
        return this._collection.insertMany(data, options);
    }

    /* tslint:disable */
    /**
     * Update a single document.
     * updateOne() updates data in three steps: set, add, delete.
     * This method is not atomic if more than one type of actions are executed e.g. set+add set+delete or set+add+delete etc.
     * updateOne() is atomic if only one type of actions is executed e.g. only adding new values
     * @param {object} data - one document, must contains a _id field
     * @param {object} [options={}] - options of mongo's findOneAndUpdate() function plus the one(s) below
     * @param {boolean} [options.revertOnError=false] - restore db values back to the original values before the update. This action is NOT atomic. If an error happens in the set, add, delete processes, the data is stored as at where the action stopped. e.g. if an error happens in the delete step, data set and added in the previous steps are stored in db. To stop this from happening, the "revertOnerror" option reverts the document back to the status before the updateOne() is executed. This action is not atomic. If the document is updated by a different source while updateOne() is still processing data , the "revertOnError" option will overwrite the changes made from by the other source.
     * @returns {Promise<object>}
     * @memberof Mongo
     */
    /* tslint:enable */
    public async updateOne (data: IDocument, options: IUpdateOption = {}): Promise<IUpdateResults> {
        if (!data._id) {
            throw new MongoError('Update Failed: missing "_id" in document');
        }

        // if (!options.noTransform) {
        await this._transform(toArray(data), { type: DataType.DOCUMENT, schema: this._schema, array: true }, false);
        // }

        const queries = await this._getUpdateQuery(
            data,
            { type: DataType.DOCUMENT, schema: this._schema }
        );

        const results: IUpdateResults = {
            raw: {}
        };

        const dataBeforeUpdate = options.revertOnError ? await this._collection.findOne({_id: data._id}) : false;

        // force run queries in the order of set push pull
        // dateModified always triggers a $set action,
        // if this $set runs last, the return value would not be atomic for a $pull or $push only action
        // @todo: if there are errors in $push or $pull, $set will still run for setting the modified date. modified date should not change if errors happen
        const errors: { [action: string]: any } = {};
        for (const action of ['$set', '$push', '$pull']) {
            if (!queries[action]) {
                continue;
            }

            results.raw[action] = await (this._collection.findOneAndUpdate(
                {
                    _id: data._id
                },
                {
                    [action]: queries[action].values
                },
                {
                    ...options,
                    arrayFilters: queries[action].arrayFilters
                } as any // 19 Feb 2018, types for mongo node driver does not support arrayFilters
                // 12 Feb 2018, types also not support findOneAndUpdate() to return promise
            ) as any).catch((error: Error) => {
                // if (!results.error) {
                //     results.error = {};
                // }
                // results.error[action] = error;
                errors[action] = error;
            }) || {};

            // get the first result
            if (options.returnOriginal) {
                if (!results.value) {
                    results.value = results.raw[action].value;
                }
            } else {
                results.value = results.raw[action].value;
            }

           /*  results.raw[action] = await new Promise((resolve) => {
                this._collection.findOneAndUpdate(
                    {
                        _id: data._id
                    },
                    {
                        [action]: queries[action].values
                    },
                    {
                        ...options,
                        arrayFilters: queries[action].arrayFilters
                    } as any, // 19 Feb 2018, types for mongo node driver does not support arrayFilters,
                    (error, result) => {
                        if (error) {
                            if (!results.error) {
                                results.error = {};
                            }
                            results.error[action] = error;
                        } else {
                            // get the first result
                            if (options.returnOriginal) {
                                if (!results.value) {
                                    results.value = result.value;
                                }
                            } else {
                                results.value = result.value;
                            }
                        }
                        resolve(result);
                    }
                );
            }); */

            // try {
            //     results.raw[action] = await this._collection.findOneAndUpdate(
            //         {
            //             _id: data._id
            //         },
            //         {
            //             [action]: queries[action].values
            //         },
            //         {
            //             ...options,
            //             arrayFilters: queries[action].arrayFilters
            //         } as any // 19 Feb 2018, types for mongo node driver does not support arrayFilters
            //     );
            //     // get the first result
            //     if (options.returnOriginal) {
            //         if (!results.value) {
            //             results.value = results.raw[action].value;
            //         }
            //     } else {
            //         results.value = results.raw[action].value;
            //     }
            // } catch (error) {
            //     if (!results.error) {
            //         results.error = {};
            //     }
            //     results.error[action] = error;
            // }
        }

        // if (results.error) {
        if (Object.keys(errors).length) {
            if (options.revertOnError) {
                // try {
                    const revertResult = await this._collection.findOneAndReplace(
                        { _id: dataBeforeUpdate._id },
                        dataBeforeUpdate
                    ).catch((revertError) => {
                        // (results.error as any).$revert = revertError;
                        errors.$revert = revertError;
                    });
                // } catch (error) {
                //     results.error.$revert = error;
                // }
            }
            // const error = new MongoError('UpdateOne Error: ' + JSON.stringify(results.error));
            const error = new MongoError('UpdateOne Error: ' + JSON.stringify(errors));
            error.data = { ...results, error: errors } ;
            throw error;
        }

        return results;
    }

    /* tslint:disable */
    /**
     * see parameter description for query and options in http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html#find
     * @param {object} query - same as query in mongo collection.find()
     * @param {object} [options={}] - all value in options for mongo collection.find()
     * @param {object} [options.join] - query for joining other collections. format: { on: string | string[], projection?: { [fieldname]: 1 | 0 }, filters?: {...}, join?: { on: ..., projection?: ..., filters?: ..., join?: ... }[] }
     * @param {object} [options.cursor=false] - if to return a cursor, by default an array is returned
     * @returns {(Promise<Cursor | object[]>)}
     * @memberof Mongo
     */
    /* tslint:enable */
    public async find (query: IQuery, options: IFindOptions = {}): Promise<Cursor | IDocument[]> {
        const cursor = this._collection.find(
            await this._getJoinQuery(this.constructor as typeof Mongo, query, options.join),
            options
        );
        const data = options.cursor ? cursor : await cursor.toArray();
        return options.join ? await this.attachObjectIdData(data, options.join) : data;
    }

    /* tslint:disable */
    /**
     * Attach referenced collection data to a query result. Note: filters in join are not supported if this method is used directly on a query result i.e. not called from find(). Use find() if you want to filter result by the data in referenced collections
     * @param {(Cursor | object[])} data - a mongo query result
     * @param {object[]} joins - query for joining other collections. format: { on: string | string[], projection?: { [fieldname]: 1 | 0 }, join?: { on: ..., projection?: ..., join?: ... }[] }
     * @returns {(Promise<Cursor | object[]>)}
     * @memberof Mongo
     */
    /* tslint:enable */
    public async attachObjectIdData (data: Cursor | IDocument[], joins: IJoin[]): Promise<Cursor | IDocument[]> {
        if (data.constructor.name === 'Cursor') {
            return (data as Cursor).map(
                async (row: IDocument) => {
                    await this._attachDataToReferencePointer(
                        row,
                        joins,
                        {
                            type: DataType.DOCUMENT,
                            schema: this._schema
                        }
                    );
                    return row;
                }
            );
        } else {
            await this._attachDataToReferencePointer(
                data,
                joins,
                {
                    type: DataType.DOCUMENT,
                    schema: this._schema,
                    array: data.constructor.name === 'Array'
                }
            );
        }
        return data;
    }

    /**
     * attach referenced data to reference pointers found in query result
     * @ignore
     * @private
     * @param {(object[] | object)} data - query data
     * @param {object[]} joins - query for joining other collections
     * @param {object} dataSchema - schema of the data
     * @param {object} [model=this.constructor] - model class of the data
     * @returns {Promise<void>}
     * @memberof Mongo
     */
    private async _attachDataToReferencePointer (
        data: IDocument[] | IDocument,
        joins: IJoin[],
        dataSchema: IDataSchema,
        model: typeof Mongo = this.constructor as typeof Mongo
    ): Promise<void> {
        joins = toArray(joins);
        const fieldPathsInJoin = joins.reduce((fieldPaths, join) => {
            return fieldPaths.concat(toArray(join.on));
        }, [] as string[]);

        const objectIdInData: IObjectIdInData = {};
        this._findObjectIdInData(data, dataSchema, fieldPathsInJoin, objectIdInData);

        if (Object.keys(objectIdInData).length === 0) {
            return;
        }

        for (const join of joins) {
            const fields = toArray(join.on);
            const joinModel = join.model || this._findObjectIdFieldModel(fields[0], model);

            const referencePointers: IObjectIdInData = {};
            const ids: ObjectID[] = [];
            // find all ids and create an object of reference pointers indexed by id
            fields.forEach((field) => {
                // field could be in join but not in the projection of the upper level
                // example in test case: should filter resursive object id referenced fields when there are multiple matches
                if (objectIdInData[field]) {
                    objectIdInData[field].forEach((referencePointer) => {
                        const id = (referencePointer.parent as any)[referencePointer.field]._id;
                        if (!referencePointers[id]) {
                            referencePointers[id] = [];
                        }
                        referencePointers[id].push(referencePointer);
                        ids.push(id);
                    });
                }
            });

            let joinData = join.data;
            if (!joinData) {
                const projection = join.projection;
                if (projection && projection._id === 0) {
                    delete projection._id;
                }

                joinData = this._db.collection(joinModel.getCollectionName()).find(
                    {
                        _id: {
                            $in: ids
                        }
                    },
                    { projection }
                );
            }

            // if else here is for looping cursor only once to attach data
            if (join.join) {
                await this._attachDataToReferencePointer(
                    await joinData.map((row: IDocument) => {
                        // field could be in join but not in the projection of the upper level
                        // example in test case: should filter resursive object id referenced fields when there are multiple matches
                        if (referencePointers[row._id]) {
                            referencePointers[row._id].forEach((referencePointer) => {
                                (referencePointer.parent as any)[referencePointer.field] = row;
                            });
                        }
                        return row;
                    }).toArray(),
                    join.join,
                    {
                        type: DataType.DOCUMENT,
                        schema: joinModel.getSchema(),
                        array: true
                    },
                    joinModel
                );
            } else {
                await new Promise((resolve) => {
                    (joinData as Cursor).forEach(
                        (row) => {
                            // field could be in join but not in the projection of the upper level
                            // example in test case: should filter resursive object id referenced fields when there are multiple matches
                            if (referencePointers[row._id]) {
                                referencePointers[row._id].forEach((referencePointer) => {
                                    (referencePointer.parent as any)[referencePointer.field] = row;
                                });
                            }
                        },
                        () => resolve()
                    );
                });
            }
        }
    }

    /**
     * find all object id values in a query result
     * @ignore
     * @private
     * @param {*} data - (row) data in query
     * @param {object} dataSchema - data schema
     * @param {string[]} fieldPathsInJoin - values of the "on" fields in joins
     * @param {IObjectIdInData} objectIdInData - object id values found in a query result
     * @param {IReferencePointer} [referencePointer] - current reference pointer to the data param
     * @memberof Mongo
     */
    private _findObjectIdInData (
        data: any,
        dataSchema: IDataSchema,
        fieldPathsInJoin: string[],
        objectIdInData: IObjectIdInData,
        referencePointer?: IReferencePointer
    ): void {
        if (dataSchema) { // _id field and auto generated fields (e.g.dateCreated etc) do not have schema values.
            if (dataSchema.array) {
                toArray(data).forEach((row, index) => {
                    this._findObjectIdInData(
                        row,
                        {
                            ...dataSchema,
                            array: false
                        },
                        fieldPathsInJoin,
                        objectIdInData,
                        {
                            parent: data,
                            field: index,
                            path: referencePointer && referencePointer.path || []
                        }
                    );
                });
            } else {
                switch (dataSchema.type) {
                    case DataType.DOCUMENT:
                        if (!dataSchema.schema) {
                            throw new SchemaError(
                                `Undefined "schema" property on "${dataSchema.type}" type in ${JSON.stringify(dataSchema)}`
                            );
                        }
                        for (const field in data) {
                            this._findObjectIdInData(
                                data[field],
                                dataSchema.schema[field],
                                fieldPathsInJoin,
                                objectIdInData,
                                {
                                    parent: data,
                                    field,
                                    path: toArray(referencePointer && referencePointer.path).concat(field)
                                }
                            );
                        }
                        break;
                    case DataType.OBJECTID:
                        if (data && referencePointer) {
                            if (!dataSchema.model) {
                                throw new SchemaError(
                                    `Undefined "model" property on "${dataSchema.type}" type in ${JSON.stringify(dataSchema)}`
                                );
                            }

                            const fieldPath = (referencePointer.path as string[]).join('.');
                            if (fieldPathsInJoin.includes(fieldPath)) {
                                const collection = dataSchema.model.getCollectionName();

                                if (!objectIdInData[fieldPath]) {
                                    objectIdInData[fieldPath] = [];
                                }

                                // clear object id data, if refereced data is not found,
                                // the result will be { _id: ObjectId(...) } instead of the origin ObjectID or DBRef
                                (referencePointer.parent as any)[referencePointer.field] = {
                                    // data.oid = DbRef type in mongo
                                    _id: data.constructor.name === 'ObjectID' ? data : data.oid
                                };
                                objectIdInData[fieldPath].push(referencePointer);
                            }
                        }
                        break;
                }
            }
        }
    }

    /**
     * create a query based on joins
     * @ignore
     * @private
     * @param {object} model - model class on which the join is applied
     * @param {object} [query={}] - existing queries
     * @param {object[]} [joins] - query for joining other collections
     * @returns {Promise<object>} - query based on join data
     * @memberof Mongo
     */
    private async _getJoinQuery (model: typeof Mongo, query: IQuery = {}, joins?: IJoin[]): Promise<IQuery> {
        if (query && typeof(query._id) === 'string') {
            query._id = this.getObjectID(query._id);
        }

        if (joins) {
            const joinQuery: IQuery = {
                $and: []
            };

            for (const join of toArray(joins)) {
                const fields = toArray(join.on);
                join.model = this._findObjectIdFieldModel(fields[0], model);
                const filters = await this._getJoinQuery(join.model, join.filters, join.join);

                if (Object.keys(filters).length) {
                    const projection = join.projection || {};
                    if (projection._id === 0) {
                        delete projection._id;
                    }

                    const cursor = this._db.collection((join.model as typeof Mongo).getCollectionName() as string).find(
                        filters,
                        {
                            projection
                        }
                    );

                    const ids = (await cursor.toArray()).map((row) => row._id);
                    fields.forEach((field) => {
                        joinQuery.$and.push({
                            [field]: {
                                $in: ids
                            }
                        });
                    });

                    cursor.rewind();
                    join.data = cursor;
                }
            }

            if (joinQuery.$and.length) {
                if (query && Object.keys(query).length) {
                    joinQuery.$and.push(query);
                }
                return joinQuery;
            }
        }

        return query;
    }

    /**
     * find the model class that the join field references to
     * @ignore
     * @private
     * @param {string} fieldPath - the "on" value in join i.e the field name/path of the join
     * @param {object} model - model class that contains the field
     * @returns {object} - model class that the field references to
     * @memberof Mongo
     */
    private _findObjectIdFieldModel (fieldPath: string, model: typeof Mongo): typeof Mongo {
        const fields = fieldPath.split('.');
        let schema: ISchema = model.getSchema();
        while (fields.length > 1) {
            const field = fields.shift() as string;
            if (schema[field].schema) {
                schema = schema[field].schema as ISchema;
            } else {
                throw new SchemaError(
                    '\nUndefined "model" property or Invalid Object ID field in join statement.\n'
                    + `On: "${fieldPath}"\n`
                    + `Collection: ${model.getCollectionName()}\n`
                    + `Schema: ${JSON.stringify(model.getSchema())}\n`
                );
            }
        }

        const objectIdField = fields.shift();
        const fieldModel = objectIdField && schema && schema[objectIdField] && schema[objectIdField].model;
        if (fieldModel) {
            return fieldModel;
        }
        throw new SchemaError(
            '\nUndefined "model" property or Invalid Object ID field in join statement.\n'
            + `On: "${fieldPath}"\n`
            + `Collection: ${model.getCollectionName()}\n`
            + `Schema: ${JSON.stringify(model.getSchema())}\n`
        );
    }

    /**
     * create json schema for validation in mongo
     * @ignore
     * @private
     * @param {object} schema - model schema
     * @returns {object} - validation schema
     * @memberof Mongo
     */
    private _getJsonSchema (schema: ISchema): IJsonSchema {
        const jsonSchema: IJsonSchema = {
            bsonType: 'object',
            additionalProperties: false
        };
        const properties: IJsonSchemaProperties = {
            _id: {
                bsonType: 'objectId'
            },
            [GeneratedField.DATE_MODIFIED]: {
                bsonType: 'date'
            }
        };
        const required: string[] = [];

        for (const field in schema) {
            let propertyJsonSchema: IJsonSchema = {};

            schema[field].maxLength && (propertyJsonSchema.maxLength = schema[field].maxLength);
            schema[field].minLength && (propertyJsonSchema.minLength = schema[field].minLength);
            schema[field].minimum && (propertyJsonSchema.minimum = schema[field].minimum);
            schema[field].maximum && (propertyJsonSchema.maximum = schema[field].maximum);
            schema[field].pattern && (propertyJsonSchema.pattern = schema[field].pattern);

            switch (schema[field].type) {
                case DataType.NUMBER:
                    propertyJsonSchema.bsonType = ['double', 'int', 'long', 'decimal'];
                    break;
                case DataType.ENUM:
                    propertyJsonSchema.enum = schema[field].enum;
                    break;
                case DataType.DOCUMENT:
                    propertyJsonSchema = this._getJsonSchema(schema[field].schema as ISchema);
                    break;
                default:
                    propertyJsonSchema.bsonType = schema[field].type;
                    break;
            }

            if (schema[field].array) {
                properties[field] = {
                    bsonType: 'array',
                    items: propertyJsonSchema
                };

                schema[field].maxItems && (properties[field].maxItems = schema[field].maxItems);
                schema[field].minItems && (properties[field].minItems = schema[field].minItems);
                schema[field].uniqueItems && (properties[field].uniqueItems = schema[field].uniqueItems);
            } else {
                properties[field] = propertyJsonSchema;
            }

            if (schema[field].required) {
                required.push(field);
            } else { // allow null & undefined as value
                if (properties[field].bsonType) {
                    properties[field].bsonType = [ ...toArray(properties[field].bsonType), 'null' ];
                }
                if (properties[field].enum) {
                    properties[field].enum = [ ...toArray(properties[field].enum), null ];
                }
            }
        }

        jsonSchema.properties = properties;

        if (required.length) {
            jsonSchema.required = required;
        }

        return jsonSchema;
    }

    /**
     * add modified date in the main doc and docs in arrays, add _id in docs in arrays
     * set default value (if defualt !== undefined, default could be 0)
     * apply setter
     * convert valid numbers (!isNaN()) to number '123' => 123
     * convert string boolean to boolean 'false' or '0'  => false and cast other values to boolean
     * convert object id and _id string to ObjectID object
     * convert valid date string to Date object
     * @ignore
     * @param data - document data to save
     * @param dataSchema - schema of the current data
     * @param referencePointer - variable used internally in this method
     */
    private async _transform (
        data: any,
        dataSchema: IDataSchema,
        insert: boolean = true,
        referencePointer?: IReferencePointer
    ): Promise<void> {
        if (!dataSchema) {
            return;
        }

        if (data === undefined) {
            if (insert && dataSchema.default !== undefined && referencePointer) {
                (referencePointer.parent as any)[referencePointer.field] = dataSchema.default;
                data = dataSchema.default;
            } else {
                return;
            }
        }

        if (dataSchema.array) {
            // toArray(data).forEach(async (row, index) => {
            data = toArray(data);
            for (let index = data.length - 1; index >= 0; index--) {
                if (dataSchema.type === DataType.DOCUMENT) {
                    data[index][GeneratedField.DATE_MODIFIED] = new Date();
                    // data[index]._id = data[index]._id ? this.getObjectID(data[index]._id) || data[index]._id : new ObjectID();
                    if (data[index]._id) {
                        data[index]._id = this.getObjectID(data[index]._id) || data[index]._id;
                    } else if (insert) {
                        data[index]._id = new ObjectID();
                    }
                }
                await this._transform(
                    data[index],
                    { ...dataSchema, array: false },
                    insert,
                    { parent: data, field: index }
                );
            }
        } else {
            if (dataSchema.setter) {
                data = await dataSchema.setter(data, referencePointer ? referencePointer.parent : data);
                this._setTransformedValue(data, referencePointer);
            }

            switch (dataSchema.type) {
                case DataType.DOCUMENT:
                    if (!dataSchema.schema) {
                        throw new SchemaError(
                            `Undefined "schema" property on "${dataSchema.type}" type in ${JSON.stringify(dataSchema)}`
                        );
                    }
                    if (data instanceof Object) {
                        for (const field in dataSchema.schema) {
                            await this._transform(
                                data[field],
                                dataSchema.schema[field],
                                insert,
                                { parent: data, field }
                            );
                        }
                    }
                    break;
                case DataType.NUMBER:
                    if (!isNaN(data)) {
                        this._setTransformedValue(+data, referencePointer);
                    }
                    break;
                case DataType.DATE:
                    const date = new Date(data);
                    if (!isNaN(date.getTime())) {
                        this._setTransformedValue(date, referencePointer);
                    }
                    break;
                case DataType.BOOLEAN:
                    this._setTransformedValue((data === 'false' || data === '0') ? false : !!data, referencePointer);
                    break;
                case DataType.OBJECTID:
                    this._setTransformedValue(this.getObjectID(data) || data, referencePointer);
                    break;
            }
        }
    }

    /**
     * attach transformed value to reference pointer
     * @ignore
     * @param newValue - new value
     * @param referencePointer - reference pointer
     */
    private _setTransformedValue (newValue: any, referencePointer?: IReferencePointer): void {
        if (referencePointer) {
            (referencePointer.parent as any)[referencePointer.field] = newValue;
        }
    }

    /**
     * generate update queries
     * @ignore
     * @private
     * @param {*} data - document data
     * @param {object} dataSchema - schema of the data
     * @param {object} [parent] - query filters and field paths in parent fields, this is this method's internal variable
     * @param {object} [queries] - this method's internal variable
     * @returns {Promise<object>}
     * @memberof Mongo
     */
    private async _getUpdateQuery (
        data: any,
        dataSchema: IDataSchema,
        parent: IUpdateQueryParent = { arrayFilters: [], path: [] }, // fields: [],
        queries: IUpdateQueries = {}
    ): Promise<IUpdateQueries> {

        if (!dataSchema) { // _id field and auto generated fields (e.g.dateCreated etc) do not have schema values.
            return queries;
        }

        if (dataSchema.array) {
            if (data.$replace) {
                const dataToSet = toArray(data.$replace);
                await this._transform(dataToSet, dataSchema);
                await this._setUpdateQuery(
                    queries,
                    parent,
                    '$set',
                    dataToSet
                );
                return queries;
            }

            if (data.$delete) {
                await this._setUpdateQuery(
                    queries,
                    parent,
                    '$pull',
                    dataSchema.type === DataType.DOCUMENT ? {
                        _id: {
                            $in: toArray(data.$delete).map((id) => this.getObjectID(id))
                        }
                    } : {
                        $in: toArray(data.$delete)
                    }
                );
                // data = data.$update || [];
                if (!data.$update) {
                    return queries;
                }
            }

            if (data.$update) {
                await this._transform(
                    dataSchema.type === DataType.DOCUMENT ? toArray(data.$update).filter((row) => row._id) : toArray(data.$update),
                    dataSchema
                );
            }

            data = toArray(data.$update || data);

            if (dataSchema.type === DataType.DOCUMENT) {
                const dataToInsert: IDocument[] = [];
                for (let index = data.length - 1; index >= 0; index--) {
                    if (data[index]._id) {
                        // update, find in db
                        await this._getUpdateQuery(
                            data[index],
                            { ...dataSchema, array: false },
                            {
                                arrayFilters: parent.arrayFilters.concat({
                                    [`i${data[index]._id}._id`]: this.getObjectID(data[index]._id)
                                }),
                                path: parent.path.concat(`$[i${data[index]._id}]`)
                            },
                            queries
                        );
                    } else {
                        // data[index]._id = new ObjectID();
                        await this._transform([data[index]], dataSchema);
                        dataToInsert.push(data[index]);
                    }
                }
                if (dataToInsert.length) {
                    await this._setUpdateQuery(
                        queries,
                        parent,
                        '$push',
                        {
                            $each: dataToInsert
                        }
                    );
                }
            } else {
                await this._setUpdateQuery(
                    queries,
                    parent,
                    '$push',
                    {
                        $each: data
                    }
                );
            }
        } else {
            switch (dataSchema.type) {
                case DataType.DOCUMENT:
                    if (!dataSchema.schema) {
                        throw new SchemaError(
                            `Undefined "schema" property on "${dataSchema.type}" type in ${JSON.stringify(dataSchema)}`
                        );
                    }
                    if (data instanceof Object) {
                        for (const field in data) {
                            await this._getUpdateQuery(
                                data[field],
                                field === GeneratedField.DATE_MODIFIED ? {
                                    type: DataType.DATE
                                } : dataSchema.schema[field],
                                {
                                    arrayFilters: parent.arrayFilters,
                                    path: parent.path.concat(field)
                                },
                                queries
                            );
                        }
                    }
                    break;
                default:
                    await this._setUpdateQuery(
                        queries,
                        parent,
                        '$set',
                        data
                    );
                    break;
            }
        }

        return queries;
    }

    /**
     * set query values
     * @ignore
     * @private
     * @param {object} queries
     * @param {object} parent
     * @param {string} action
     * @param {*} data
     * @returns {Promise<void>}
     * @memberof Mongo
     */
    private async _setUpdateQuery (
        queries: IUpdateQueries,
        parent: IUpdateQueryParent,
        action: string,
        data: any
    ): Promise<void> {
        const parentPath = parent.path.join('.');

        if (!queries[action]) {
            queries[action] = {
                values: {},
                arrayFilters: []
            };
        }

        Object.assign(queries[action].values, {
            [parentPath]: data
        });

        const currentFiltersById: { [id: string]: number } = {};
        queries[action].arrayFilters.forEach((filter) => {
            for (const id in filter) {
                currentFiltersById[id.substr(1)] = 1;
            }
        });

        queries[action].arrayFilters.push(
            ...parent.arrayFilters.filter((filter) => {
                for (const id in filter) {
                    if (currentFiltersById[id.substr(1)]) {
                        return false;
                    }
                }
                return true;
            })
        );
    }

}

export default Mongo;

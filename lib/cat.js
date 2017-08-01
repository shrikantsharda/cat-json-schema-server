/** Copyright (c) 2013 Toby Jaffey <toby@1248.io>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

var config = require('./config');
var db = require('./mongo');
var _ = require('underscore');
var Ajv = require('ajv');
var ajv = new Ajv();
var metaSchema = require('ajv/lib/refs/json-schema-draft-04.json');
ajv.addMetaSchema(metaSchema);
ajv._opts.defaultMeta = metaSchema.id;
var fs = require('fs');

function sanitize(doc) {
    delete doc._id;
    return doc;
}

function create_item(item, cb) {
    var items = db.get().collection('items');
    items.ensureIndex({href:1}, {unique:true}, function(err, indexName) {
        if (err)
            cb("duplicate href", null);
        else {
            items.insert(item, {w:1}, function(err, rspdoc) {
                if (err)
                    cb("insert fail", null);
                else {
                    cb(null, rspdoc);
                }
            });
        }
    });
}

function update_item(href, item, cb) {
    var items = db.get().collection('items');
    items.update({href:href}, {$set: item}, {safe: true, upsert: true}, function(err, doc) {
        if (err)
            cb("update failed");
        else {
            cb(null);
        }
    });
}

function validateMetadataArray(metadataArray) {
    var hasDescription = false;
    for (var i=0;i<metadataArray.length;i++) {
        if (typeof metadataArray[i] != 'object'){
            console.log("MD Here ")
            return false;
        }
        if (Object.keys(metadataArray[i]).length != 2){
            console.log("MD Here 1")
            return false;
        }
        if (typeof metadataArray[i].rel != 'string'){
            console.log("MD Here 2")
            return false;
        }
        if (typeof metadataArray[i]['val'] != 'string'){
            if (typeof metadataArray[i]['param-metadata'] != 'object'){
              console.log(metadataArray[i].rel)
              console.log(metadataArray[i].val)
              console.log("MD Here 3")
              return false;
            }
        }
        if (metadataArray[i].rel == 'urn:X-rbccps:rels:hasDescription:en')
            hasDescription = true;
    }
    //if (!hasDescription)
    //    return false;
    return true;
}

function validateItem(item) {
    try {
        // a valid item must have href and a metadata array
        if (typeof item.href != 'string'){
            console.log("Here ")
            return false;
        }
        // if (!(item['i-object-metadata'] instanceof Array)){
        //     console.log("Here 1")
        //     return false;
        // }
        // if (!validateMetadataArray(item['i-object-metadata'])){
        //     console.log("Here 2")
        //     return false;
        // }
    } catch(e) { return false; }
    return true;
}


function filterSearch(docs, href, rel, val) {
    // FIXME, this is for clarity, not speed
    var ret = [];
    if (href === undefined && rel === undefined && val === undefined)
        return docs;

    for (var i=0;i<docs.length;i++) {
        if (href !== undefined && href == docs[i].href) {
            ret.push(docs[i]);
            continue;
        }
        for (var j=0;j<docs[i]['i-object-metadata'].length;j++) {

            if (rel !== undefined && rel == docs[i]['i-object-metadata'][j].rel) {
                ret.push(docs[i]);
                continue;
            }
            if (val !== undefined && val == docs[i]['i-object-metadata'][j].val) {
                ret.push(docs[i]);
                continue;
            }
        }
    }
    return ret;
}
//Function to make filter for mongo.find function

function makefilter(href, rel, val) {
    var f = {};
    var re;

    if (href === undefined && rel === undefined && val === undefined)
        return f;

    if (href !== undefined) {
        re = new RegExp(href)
        console.log(re);
        console.log(href);
        f = {href:re};
        return f;
    }

    if (rel !== undefined && val == undefined){
        re = new RegExp(rel)
        f = {"i-object-metadata.rel":re}
    }
    if (rel !== undefined && val !== undefined){
        re_1 = new RegExp(rel)
        re_2 = new RegExp(val)
        f = {"i-object-metadata.rel":re_1,"i-object-metadata.val":re_2}
        //f = {"i-object-metadata.param-metadata.rel":re_1,"i-object-metadata.param-metadata.val":re_2}
    }
    return f;
}

function makeFilter(query) {
    var filter = {};
    var im = "item-metadata.";
    Object.keys(query).forEach(function(key) {
        //console.log(key + ": " + req.query[key]);
        if (key == "href") {
            filter[key] = query[key];
        } else {
            var temp = query[key];
            key = im + key;
            filter[key] = temp;
        }
    });
    return filter;
}

function makefilter_param_metadata(href, rel, val) {
    var f = {};
    var re;

    if (href === undefined && rel === undefined && val === undefined)
        return f;

    if (href !== undefined) {
        re = new RegExp(href)
        f = {href:re};
        return f;
    }

    if (rel !== undefined && val == undefined){
        re = new RegExp(rel)
        f = {"i-object-metadata.param-metadata.rel":re}
    }
    if (rel !== undefined && val !== undefined){
        re_1 = new RegExp(rel)
        re_2 = new RegExp(val)
        f = {"i-object-metadata.param-metadata.rel":re_1,"i-object-metadata.param-metadata.val":re_2}
    }
    return f;
}

exports.hypercat = function(req,res){
    items = db.get().collection('items');
    var filter=makefilter(undefined,"deviceDomain",undefined); //= makefilter(req.query.href, req.query.rel, req.query.val);
    var total,domain;
    items.find({},function(err,cursor){
        if(err)
            res.send(500);
        else{
            cursor.toArray(function(err,docs){
               total = docs.length;
               //console.log(count);

               items.find(filter).toArray(function(err,finalres){
                  if (err) throw err;

                   domain = finalres.length;
                   //var obj = JSON.parse(finalres);

                   console.log(domain);


                  res.send(200,finalres);
               });

            });
        }
    });

};

exports.get = function(req, res) {
    //console.log(res);
    items = db.get().collection('items');
    var filter = makeFilter(req.query);//makefilter(req.query.href, req.query.rel, req.query.val);

    items.find(filter, function(err, cursor) {
        if (err)
            res.send(500);
        else {
            cursor.toArray(function(err, docs) {
            if (docs.length == 0)
            {
              // var f1 = makefilter_param_metadata(req.query.href, req.query.rel, req.query.val);
              // items.find(f1, function(err, cursor) {
              //    if (err)
              //      res.send(500);
              //    else{
              //      cursor.toArray(function(err, docs) {
              //      var cat = {
              //          "item-metadata": [
              //              {
              //                  rel:"urn:X-rbccps:rels:isContentType",
              //                  val:"application/vnd.rbccps.catalogue+json"
              //              },
              //              {
              //                  rel:"urn:X-rbccps:rels:hasDescription:en",
              //                  val:"Catalogue test"
              //              },
              //              {
              //                  rel:"urn:X-rbccps:rels:supportsSearch",
              //                  val:"urn:X-rbccps:search:simple"
              //              }
              //          ],
              //          items: _.map(docs, sanitize)
              //      };
              //      res.status(200).jsonp(cat);
              //          //res.render('catlog', {results: cat });
              //    })

              // }
              // })
                res.send(200, "No docs found");

            }
            else
            {
            //console.log(docs.length)
                // FIXME, this should be done with mongodb find() in the db, not here
                //docs = filterSearch(docs, req.query.href, req.query.rel, req.query.val);
                // construct a catalogue object
                var cat = {
                    "item-metadata": [
                        {
                            rel:"urn:X-rbccps:rels:isContentType",
                            val:"application/vnd.rbccps.catalogue+json"
                        },
                        {
                            rel:"urn:X-rbccps:rels:hasDescription:en",
                            val:"Catalogue test"
                        },
                        {
                            rel:"urn:X-rbccps:rels:supportsSearch",
                            val:"urn:X-rbccps:search:simple"
                        }
                    ],
                    items: _.map(docs, sanitize)
                };
                //res.send(200, cat);
                //res.render('index_pug.pug',{title:'Search Results', message: 'hello'})
                //res.render('index_pug.pug', {title:'Search Results', results: cat}) 
                res.status(200).jsonp(cat);
                //render pug
                //res.render('catlog', {results: cat });

             }
            });
        }
    });
};

exports.put = function(req, res) {
    if (!validateItem(req.body)) {
        res.send(400);  // bad request
    } else {
        items = db.get().collection('items');
        items.findOne({href:req.query.href}, function(err, doc) {
            if (err !== null) {
                res.send(400);
            } 
            else
            if (doc !== null) {
                update_item(req.query.href, req.body, function(err) {
                    if (err) {
                        res.send(400);  // problem
                    } else {
                        
                        res.send(200);
                    }
                });
            } else {
                res.send(404);  // not found
            }
        });
    }
};

exports.post = function(req, res) {
    var request = require('request');
    var $RefParser = require('json-schema-ref-parser');
    fs.readFile("./schemas/" + req.body["item-metadata"][0].refCatalogueSchema, 'utf8', function(error, data) {
        if (error == null) {
            $RefParser.dereference(JSON.parse(data), function(errDeref, postSchema) {
                if (errDeref) {
                    console.log(errDeref);
                } else {
                    var valid = ajv.validate(postSchema, req.body["item-metadata"][0]);
                    if (!valid) {
                        res.send(400, ajv.errors);  // bad request
                        console.log(ajv.errors);
                    } else {
                        items = db.get().collection('items');
                        items.findOne({href:req.query.href}, function(err, doc) {
                            if (err !== null){
                                res.send(400);
                            }else if (doc !== null) {
                                // update_item(req.query.href, req.body, function(err) {
                                //     if (err) {
                                //         res.send(400);  // problem
                                //     } else {
                                //         res.send(200);
                                //     }
                                // });
                                res.send("Cannot update an already existing item. Create new one!");
                            } else {
                                if (req.query.href != req.body.href) {
                                    console.log('query href not equal to body href!');
                                    res.send(409,req.body.href.toString());  // conflict
                                    return;
                                }
                                create_item(req.body, function(err) {
                                    if (err) {
                                        res.send(409, err);  // conflict
                                        console.log(err);
                                    } else {
                                        res.location('/cat');
                                        res.send(201);  // created
                                    }
                                });
                            }
                        });
                    }
                }
            });
        } else {
            res.send(error);
        }
    });
    
};

exports.delete = function(req, res) {
    items = db.get().collection('items');
    var filter = {href:req.query.href};
    items.remove(filter, function(err, doc) {
        if (err)
            res.send(500);  // not found
        else
            res.send(200);
    });
};

/*
 exports.create = function(req, res) {
 // check if already exists
 req.params.cat_id
 // validate req.body as complete catalogue
 };
 */


if (!(typeof _ === "function")) {
    global._ = require("underscore");
}
if (!(typeof $ === "function")) {
    global.$ = global.jQuery = require("jquery");
}

require("node-polyfill");

var ObjectPath = require("object-path");
var Observe = require("observe-js");
var EventEmitter2 = require("eventemitter2").EventEmitter2;

if (!global._eventEmitter) {
    global._eventEmitter = new EventEmitter2({
        wildcard: true,
        maxListeners: 100
    })
}

function setEventEmitter(ee) {
    if (module.exports.eventEmitter) {
        throw "Cannot set the component event emitter because it is already set."
    }
    module.exports.eventEmitter = eventEmitter = ee;
}

var Binding = Object.extend({
    metaKey:"_m",
    template:undefined,
    arrayPathPattern:/[\[\]]]/g,
    objectPathDelimiterPattern:/\./g,
    toObjectPath:function(observePath) {
        return observePath.replace(this.arrayPathPattern, ".");
    },
    parseBindingKey:function(key) {
        var parts = key.split(":");
        var modelKey;
        var viewKey;
        if (parts.length===1) {
            modelKey = parts[0];
        }
        else if (parts.length===2) {
            modelKey = parts[0];
            viewKey = parts[0]+"."+parts[1];
        }
        return {
            modelKey:modelKey,
            viewKey:viewKey
        }
    },
    initialize:function(options) {
        _.extend(
            this,
            _.pick(options?options:{}, "injectionKey", "metaKey")
        )
        this.observers = {};
        this.setContext(options.$context);
        return this;
    },
    destroy:function() {
        this.detachEventListeners();
        this.detachObservers();
        if (this.$el) {
            this.$el.remove();
        }
        delete this.$context;
        delete this.$el;
    },
    meta:function(path) {
        if (!path) {
            return this.model[this.metaKey]||{};
        }
        else if (_.isObject(path)) {
            return path[this.metaKey]||{};
        }
        else if (_.isString(path)) {
            var target = this.model;
            var objectPath = this.toObjectPath(path);
            var parts = objectPath.split(this.objectPathDelimiterPattern);
            var pathToParent = parts.slice(-1);
            var parent = ObjectPath.get(target, pathToParent);
            if (parent&&parent[this.metaKey]) {
                return parent[this.metaKey][_.last(parts)]||{};
            }
            else {
                return {};
            }
        }
    },
    getRenderModel:function() {
        return this.model;
    },
    getRenderMetadata:function() {
        return this.meta();
    },
    set:function(path, value, root) {
        if (!root) {
            root = this.model;
        }
        if (!path) {
            throw "Path cannot be empty or undefined"
        }
        ObjectPath.set(root, path, value);
    },
    get:function(path, root) {
        if (!root) {
            root = this.model;
        }
        if (!path) {
            return root;
        }
        return ObjectPath.get(root, path);
    },
    setContext:function($context) {
        if ($context&&$context.is(this.$context)) {
            return;
        }
        this.$context = $context;
        this.detachEventListeners();
        return this;
    },
    attachEventListeners:function() {
        return this;
    },
    detachEventListeners:function() {
        return this;
    },
    preRender:function() {
        return this;
    },
    render:function() {
        return $();
    },
    escapeSelectorValue:function(value) {
        return value.replace(/\./g, "\\.");
    },
    inject:function(options) {
        options = _.extend({}, options);
        var $injectEl;
        if (!this.$context) {
            return;
        }
        if (options.$injectEl) {
            $injectEl = options.$injectEl;
        }
        else {
            $injectEl = this.$el;
        }
        if (!$injectEl) {
            return;
        }
        var $targetEl;
        //console.log("Protoblock:ObjectBinding:render:inject, injectionKey:"+this.injectionKey);
        if (this.injectionKey) {
            var escapedInjectionKey = this.escapeSelectorValue(this.injectionKey);
            $targetEl = this.$context.find("[inject="+escapedInjectionKey+"]").not(this.$context.find("[inject] [inject="+escapedInjectionKey+"]"));
        }
        else {
            $targetEl = this.$el;
        }
        if ($targetEl&&!$injectEl.is($targetEl)) {
            $targetEl.replaceWith($injectEl);
        }
    },
    update:function(options) {
        options = _.extend({}, options);
        if (!this.model) {
            return;
        }
        var $currentEl = this.$el;
        this.preRender(options);
        var $newEl = this.render(options);
        this.inject({
            $injectEl:$newEl
        });
        this.$el = $newEl;
        this.postRender(options);
        if ($currentEl) {
            $currentEl.remove();
        }

        this.attachEventListeners();

        return this;
    },
    postRender:function() {
        return this;
    }
});

var CollectionBinding = Binding.extend({
    itemViewKey:"items",
    itemBinding:undefined,
    itemMixins:{
        inject:function(options) {
            options = _.extend({}, options);
            var $injectEl;
            if (!this.$context) {
                return;
            }
            if (options.$injectEl) {
                $injectEl = options.$injectEl;
            }
            else {
                $injectEl = this.$el;
            }
            if (!$injectEl) {
                return;
            }
            var escapedInjectionKey = this.escapeSelectorValue(this.injectionKey);
            var $itemsEl = this.$context.find("[inject="+escapedInjectionKey+"]");
            if ("index" in options) {
                $injectEl.insertAfter($itemsEl.eq(options.index));
            }
            else if (this.$el&&!$injectEl.is(this.$el)) {
                this.$el.replaceWith($injectEl);
            }
            else {
                $injectEl.insertAfter($itemsEl.last());
            }
        }
    },
    initialize:function(options) {
        options = _.extend({}, options);
        Binding.initialize.call(this, options);
        this.itemInjectionKey = this.itemViewKey;
        this.bindings = [];
        this.setModel(options.model);
        return this;
    },
    setModel:function(model) {
        if (this.model===model) {
            return;
        }
        if (this.model) {
            this.detachObservers();
        }
        this.model = model;
        if (this.model) {
            this.attachObservers();
            for (var i=0; i<this.bindings.length; i++) {
                this.bindings[i].destroy();
            }
            this.bindings = [];
            this.bindings.length = this.model.length;
            for (var i=0; i<this.model.length; i++) {
                var itemBinding = _.isFunction(this.itemBinding)?this.itemBinding(this.model[i]):this.itemBinding;
                this.bindings[i] = itemBinding
                    .extend({
                        inject:this.itemMixins.inject,
                        injectionKey:this.itemInjectionKey
                    })
                    .initialize({
                        model:this.model[i],
                        $context:this.$el
                    })
            }
        }
        this.update();
        return this;
    },
    observe:function(splices) {
        splices.forEach(function(splice) {
            var binding;
            var bindingsRemoved = [];
            for (var i=splice.index; i<splice.index+splice.removed.length; i++) {
                binding = this.bindings[i];
                bindingsRemoved.push(binding);
                binding.destroy();
            }
            this.bindingsRemoved(splice.index, bindingsRemoved);
            var bindingsAdded = [];
            for (var i=splice.index; i<splice.index+splice.addedCount; i++) {
                var itemBinding = _.isFunction(this.itemBinding)?this.itemBinding(this.model[i]):this.itemBinding;
                bindingsAdded.push(itemBinding
                    .extend({
                        inject:this.itemMixins.inject,
                        injectionKey:this.itemInjectionKey
                    })
                    .initialize({
                        model:this.model[i],
                        $context:this.$el
                    })
                );
            }
            var args = [splice.index, splice.removed].concat(bindingsAdded);
            [].splice.apply(this.bindings, args);
            this.bindingsAdded(splice.index, bindingsAdded);
            this.bindingsSpliced(splice.index, bindingsAdded, bindingsRemoved);
        }.bind(this));
    },
    attachObservers:function() {
        var itemObserver = new Observe.ArrayObserver(this.model);
        itemObserver.open(this.observe.bind(this));
        this.observers[""] = itemObserver;
        return this;
    },
    detachObservers:function() {
        this.observers[""].close();
        delete this.observers[""];
        return this;
    },
    render:function() {
        var $newEl = $(this.template(this.getRenderModel()));
        var $itemsEl = $(this.bindings
            .map(function(binding) {
                return binding.$el
            }))
            .map(function () {
                return this.toArray();
            });
        var escapedItemInjectionKey = this.escapeSelectorValue(this.itemInjectionKey);
        $newEl.find("[inject="+escapedItemInjectionKey+"]").replaceWith($itemsEl);
        for (var i=0; i<this.bindings.length; i++) {
            this.bindings[i].setContext($newEl);
        }
        $newEl.attr("inject", this.injectionKey);
        return $newEl;
    },
    destroy:function() {
        Binding.destroy.call(this);
        for (var i=0; i<this.bindings.length; i++) {
            this.bindings[i].destroy();
        }
    },
    bindingsAdded:function(index, bindings) {
    },
    bindingsRemoved:function(index, bindings) {
    },
    bindingsSpliced:function(index, added, removed) {
    }
});

var ObjectBinding = Binding.extend({
    initialize:function(options) {
        options = _.extend({}, options);
        Binding.initialize.call(this, options);
        this.bindings = {};
        this.setModel(options.model);
        return this;
    },
    setModel:function(model) {
        if (this.model===model) {
            return;
        }
        if (this.model) {
            this.detachObservers();
        }
        this.model = model;
        if (this.model) {
            this.attachObservers();
            for (var modelKey in this.bindings) {
                var model = this.get(modelKey);
                if (model) {
                    for (var viewKey in this.bindings[modelKey]) {
                        this.bindings[modelKey][viewKey].setModel(model);
                    }
                }
            }
        }
        this.update();
        return this;
    },
    addBinding:function(options) {
        options = _.extend(
            {
                modelKey:""
            },
            options
        );
        if (options.viewKey) {
            options.binding.injectionKey = options.viewKey;
        }
        else {
            options.binding.injectionKey = options.modelKey;
        }

        if (!(options.modelKey in this.bindings)) {
            this.bindings[options.modelKey] = {};
        }
        if (options.viewKey in this.bindings[options.modelKey]) {
            var currentBinding = this.bindings[options.modelKey][options.viewKey];
            if (currentBinding===options.binding) {
                return;
            }
            else {
                currentBinding.destroy();
            }
        }
        options.binding.setContext(this.$el);
        this.bindings[options.modelKey][options.viewKey] = options.binding;
        if (!options.binding.model&&this.model) {
            options.binding.setModel(this.get(options.modelKey));
        }
        else {
            options.binding.update();
        }
        return this;
    },
    addBindings:function(bindings) {
        for (var key in bindings) {
            var binding = bindings[key];
            var keyParse = binding.parseBindingKey(key);
            this.addBinding({
                modelKey:keyParse.modelKey,
                viewKey:keyParse.viewKey,
                binding:binding.new(keyParse.options)
            });
        }
        return this;
    },
    observe:function(added, removed, changed, getOldValueFn) {
        var renderSelf = false;
        for (var modelKey in added) {
            var value = added[modelKey];
            if (modelKey in this.bindings) {
                for (var viewKey in this.bindings[modelKey]) {
                    this.bindings[modelKey][viewKey].setModel(value);
                }
            }
            else {
                renderSelf = true;
            }
        }
        for (var modelKey in changed) {
            var value = changed[modelKey];
            if (modelKey in this.bindings) {
                for (var viewKey in this.bindings[modelKey]) {
                    this.bindings[modelKey][viewKey].setModel(value);
                }
            }
            else {
                renderSelf = true;
            }
        }
        for (var modelKey in removed) {
            if (modelKey in this.bindings) {
                for (var viewKey in this.bindings[modelKey]) {
                    this.bindings[modelKey][viewKey].setModel();
                }
            }
            else {
                renderSelf = true;
            }
        }
        if (renderSelf) {
            this.update();
        }
    },
    /*
    TODO
    Still doesn't handle case where another object binding is added at a deep model key and is changed/added/removed, since
    the ObjectObserver only observes direct properties of this.model
    */
    attachObservers:function() {
        var propertyObserver = new Observe.ObjectObserver(this.model);
        propertyObserver.open(this.observe.bind(this));
        this.observers[""] = propertyObserver;
        return this;
    },
    detachObservers:function() {
        this.observers[""].close();
        delete this.observers[""];
        return this;
    },
    render:function() {
        var $newEl = $(this.template(this.getRenderModel(), this.getRenderMetadata()));
        for (var modelKey in this.bindings) {
            for (var viewKey in this.bindings[modelKey]) {
                var binding = this.bindings[modelKey][viewKey];
                binding.setContext($newEl);
                //console.log("Protoblock:ObjectBinding:render:render, viewKey:"+viewKey+", modelKey:"+modelKey);
                binding.inject();
            }
        }
        $newEl.attr("inject", this.injectionKey);
        return $newEl;
    },
    destroy:function() {
        Binding.destroy.call(this);
        for (var modelKey in this.bindings) {
            for (var viewKey in this.bindings[modelKey]) {
                var binding = this.bindings[modelKey][viewKey];
                binding.destroy();
            }
        }
        delete this.model;
    }
});

var ValueBinding = Binding.extend({
    parseBindingKey:function(key) {
        var parts = key.split(":");
        var modelKey;
        var viewKey;
        var propKey;
        if (parts.length===1) {
            modelKey = "";
            propKey = parts[0];
            viewKey = parts[0];
        }
        else if (parts.length===2) {
            modelKey = parts[0];
            propKey = parts[1];
            viewKey = parts[0]+"."+parts[1];
        }
        else if (parts.length===3) {
            modelKey = parts[0];
            viewKey = parts[1];
            propKey = parts[2];
        }
        return {
            modelKey:modelKey,
            viewKey:viewKey,
            options:{
                propKey:propKey
            }
        };
    },
    initialize:function(options) {
        options = _.extend({}, options);
        Binding.initialize.call(this, options);
        this.bindings = {};
        this.propKey = options.propKey;
        this.setModel(options.model);
        return this;
    },
    getRenderModel:function() {
        return this.get(this.propKey);
    },
    getRenderMetadata:function() {
        return this.meta(this.propKey);
    },
    setModel:function(model) {
        if (this.model===model) {
            return;
        }
        this.model = model;
        if (this.model) {
            this.attachObservers();
        }
        this.update();
        return this;
    },
    attachObservers:function() {
        var pathObserver = new Observe.PathObserver(this.model, this.propKey);
        pathObserver.open(this.observe.bind(this));
        this.observers[this.propKey] = pathObserver;
        return this;
    },
    detachObservers:function() {
        this.observers[this.propKey].close();
        delete this.observers[this.propKey];
        return this;
    },
    observe:function(newValue, oldValue) {
        this.update();
    },
    render:function() {
        var $newEl = $(this.template(this.getRenderModel(), this.getRenderMetadata()));
        $newEl.attr("inject", this.injectionKey);
        return $newEl;
    }
});

module.exports = {
    setEventEmitter:setEventEmitter,
    Binding:Binding,
    ValueBinding:ValueBinding,
    ObjectBinding:ObjectBinding,
    CollectionBinding:CollectionBinding
}

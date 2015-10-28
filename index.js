if (!(typeof _ === "function")) {
    global._ = require("underscore");
}
if (!(typeof $ === "function")) {
    global.$ = global.jQuery = require("jquery");
}

require("node-polyfill");

var ObjectPath = require("object-path");
var Observe = require("observe-js");
var extend = require("node.extend");

var Binding = Object.extend({
    metaKey:"_m",
    template:undefined,
    arrayPathPattern:/[\[\]]]/g,
    objectPathDelimiterPattern:/\./g,
    toObjectPath:function(observePath) {
        return observePath.replace(this.arrayPathPattern, ".");
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
    getRenderModel:function() {
        return this.model;
    },
    getRenderMetadata:function() {
        return this.meta("");
    },
    meta:function(path) {
        if (!path) {
            return {};
        }
        else if (_.isObject(path)) {
            return path[this.metaKey]||{};
        }
        else if (_.isString(path)) {
            var target = this.model;
            var objectPath = this.toObjectPath(path);
            var parts = objectPath.split(this.objectPathDelimiterPattern);
            var pathToParent = parts.slice(0, -1);
            var parent = ObjectPath.get(target, pathToParent);
            if (parent&&parent[this.metaKey]) {
                return parent[this.metaKey][_.last(parts)]||{};
            }
            else {
                return {};
            }
        }
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
        if (_.isUndefined(path)) {
            return undefined;
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
    skipUpdate:function() {
        this.skipNextUpdate = true;
    },
    update:function(options) {
        if (this.skipNextUpdate) {
            this.skipNextUpdate = false;
            return;
        }
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
    parseBindingKey:function(key) {
        var parts = key.split(":");
        var modelPath;
        var viewKey;
        if (parts.length===1) {
            modelPath = parts[0];
        }
        else if (parts.length===2) {
            modelPath = parts[0];
            viewKey = parts[1];
        }
        return {
            modelPath:modelPath,
            viewKey:viewKey
        }
    },
    initialize:function(options) {
        options = extend(true, {}, options);
        Binding.initialize.call(this, options);
        this.bindings = {};
        this.observers.children = {};
        this.observers.self = {};
        this.setModel(options.model);
        return this;
    },
    getRenderModel:function() {
        return this.get("");
    },
    getRenderMetadata:function() {
        return this.meta("");
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
            for (var modelPath in this.bindings) {
                var model = this.get(modelPath);
                if (model) {
                    for (var viewKey in this.bindings[modelPath]) {
                        this.bindings[modelPath][viewKey].setModel(model);
                    }
                }
            }
        }
        this.update();
        return this;
    },
    addBinding:function(options) {
        options = extend(
            true,
            {
                modelPath:""
            },
            options
        );
        if (options.viewKey) {
            options.binding.injectionKey = options.viewKey;
        }
        else {
            options.binding.injectionKey = options.modelPath;
        }

        if (!(options.modelPath in this.bindings)) {
            this.bindings[options.modelPath] = {};
        }
        if (options.viewKey in this.bindings[options.modelPath]) {
            var currentBinding = this.bindings[options.modelPath][options.viewKey];
            if (currentBinding===options.binding) {
                return;
            }
            else {
                currentBinding.destroy();
            }
        }
        options.binding.setContext(this.$el);
        this.bindings[options.modelPath][options.viewKey] = options.binding;
        if (!options.binding.model&&this.model) {
            options.binding.setModel(this.get(options.modelPath));
        }
        else {
            options.binding.update();
        }
        if (options.modelPath!=="") {
            this.attachObserver(options.modelPath);
        }
        return this;
    },
    addBindings:function(bindings) {
        for (var key in bindings) {
            var binding = bindings[key];
            var keyParse = binding.parseBindingKey(key);
            this.addBinding({
                modelPath:keyParse.modelPath,
                viewKey:keyParse.viewKey,
                binding:binding.new(keyParse.options)
            });
        }
        return this;
    },
    attachObserver:function(modelPath) {
        this.detachObserver(modelPath);
        var pathObserver = new Observe.PathObserver(this.model, modelPath);
        pathObserver.open(this.buildChildObserver({
            modelPath:modelPath
        }));
        this.observers.children[modelPath] = pathObserver;
    },
    attachObservers:function() {
        for (var modelPath in this.bindings) {
            this.attachObserver(modelPath);
        }
    },
    detachObserver:function(modelPath) {
        if (modelPath in this.observers) {
            this.observers[modelPath].close();
            delete this.observers[modelPath];
        }
    },
    detachObservers:function() {
        for (var modelPath in this.observers) {
            this.detachObserver(modelPath);
        }
    },
    buildChildObserver:function(options) {
        var modelPath = options.modelPath;
        return function(newValue, oldValue) {
            for (var viewKey in this.bindings[modelPath]) {
                this.bindings[modelPath][viewKey].setModel(newValue);
            }
        }.bind(this);
    },
    render:function() {
        var $newEl = $(this.template(this.getRenderModel(), this.getRenderMetadata()));
        for (var modelPath in this.bindings) {
            for (var viewKey in this.bindings[modelPath]) {
                var binding = this.bindings[modelPath][viewKey];
                binding.setContext($newEl);
                binding.inject();
            }
        }
        $newEl.attr("inject", this.injectionKey);
        return $newEl;
    }
});

var PathBinding = ObjectBinding.extend({
    parseBindingKey: function (key) {
        var parts = key.split(":");
        var modelPath;
        var viewKey;
        var path;
        if (parts.length === 1) {
            modelPath = "";
            path = parts[0];
            viewKey = parts[0];
        }
        else if (parts.length === 2) {
            modelPath = parts[0];
            path = parts[1];
            viewKey = parts[0] + "." + parts[1];
        }
        else if (parts.length === 3) {
            modelPath = parts[0];
            viewKey = parts[1];
            path = parts[2];
        }
        return {
            modelPath: modelPath,
            viewKey: viewKey,
            options: {
                path: path
            }
        };
    },
    initialize:function(options) {
        options = extend(true, {}, options);
        this.path = options.path;
        ObjectBinding.initialize.call(this, options);
        return this;
    },
    attachObservers:function() {
        ObjectBinding.attachObservers.call(this);
        var pathObserver = new Observe.PathObserver(this.model, this.path);
        pathObserver.open(this.buildSelfObserver({
            path:this.path
        }));
        this.observers.self[this.path] = pathObserver;
        return this;
    },
    detachObservers:function() {
        ObjectBinding.detachObservers.call(this);
        this.observers.self[this.path].close();
        delete this.observers.self[this.path];
        return this;
    },
    buildSelfObserver:function(options) {
        return function(newValue, oldValue) {
            this.update();
        }.bind(this);
    },
    getRenderModel:function() {
        return this.get(this.path);
    },
    getRenderMetadata:function() {
        return this.meta(this.path);
    }
});

module.exports = {
    Binding:Binding,
    PathBinding:PathBinding,
    ObjectBinding:ObjectBinding,
    CollectionBinding:CollectionBinding
}

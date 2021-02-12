/*jslint white:true, nomen: true, plusplus: true */
/*global mx, define, require, browser, devel, console, google, document, _jQuery */
/*mendix */
/*
    GoogleAutocomplete
    ========================

    @file      : GoogleAutocomplete.js
    @version   : 1.0.0
    @author    : JvdGraaf
    @date      : Fri, 05 Jun 2015 17:32:37 GMT
    @copyright : 
    @license   : Apache 2 / MIT
*/
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/dom-style",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    'dojo/html',
    "GoogleAutocomplete/lib/jquery-1.11.2",
    "dojo/text!GoogleAutocomplete/widget/template/GoogleAutocomplete.html",
    "GoogleAutocomplete/lib/jsapi"
], function (declare, _WidgetBase, _TemplatedMixin, domStyle, domConstruct, dojoArray, lang, html, _jQuery, widgetTemplate) {

    "use strict";
    var $ = _jQuery.noConflict(true);

    // Declare widget's prototype.
    return declare('GoogleAutocomplete.widget.GoogleAutocomplete', [_WidgetBase, _TemplatedMixin], {

        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,

        // Parameters configured in the Modeler.
        mfOnchange: null,
        countryLimRetrieve: null,
        countryLimitation: null,
        attrLatitude: "",
        attrLongitude: "",
        attrAddress: "",
        placeholder: "",
        attrStreet: "",
        attrHouseNr: "",
        attrPostalcode: "",
        attrCity: "",

        // Parameters for the google widget
        placeSearch: "",
        autocomplete: null,

        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,
        _alertDiv: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function () {
            this._handles = [];
        },

        // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
        postCreate: function () {
            logger.debug(this.id + ".postCreate");
            // Create global variable to store data 
            
            // Visual rendering according mendix
            this._updateRendering();
            
            // Load google library and after loading: setup events
            this._loadGoogle();
            
            // Setup interaction events
            this._setupEvents();
        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {
            this._contextObj = obj;
            this._resetSubscriptions();
            this._updateRendering();
            this._setupParams();

            callback();
        },

        // mxui.widget._WidgetBase.enable is called when the widget should enable editing. Implement to enable editing if widget is input widget.
        enable: function () {},

        // mxui.widget._WidgetBase.enable is called when the widget should disable editing. Implement to disable editing if widget is input widget.
        disable: function () {},

        // mxui.widget._WidgetBase.resize is called when the page's layout is recalculated. Implement to do sizing calculations. Prefer using CSS instead.
        resize: function (box) {},

        // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
        uninitialize: function () {
            // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
            //            window[this.id + "_AutocompleteCallback"] = null;
        },

        // We want to stop events on a mobile device
        _stopBubblingEventOnMobile: function (e) {},

        //start Google and create the map
        _loadGoogle: function () {
            if (google && (!google.maps || (google.maps && !google.maps.places))) {
                var params = (this.apiAccessKey !== "") ? "key=" + this.apiAccessKey + "&libraries=places&v=quarterly" : "libraries=places&v=quarterly";
                
                logger.debug(this.id + ".LoadGoogle with params: " + params);

                if (google.loader && google.loader.Secure === false) {
                    google.loader.Secure = true;
                }
                google.load("maps", 3.42, {
                    other_params: params,
                    callback: lang.hitch(this, this._setupParams)
                });
            } else if (google && google.maps) {
                logger.debug(this.id + ".LoadGoogle already loaded");
                this._setupParams();
            }
        },

        // Attach events to HTML dom elements
        _setupEvents: function () {
            logger.debug(this.id + "._setupEvents");
            if (this.mobileSupport) {
                $(document).on({
                    'DOMNodeInserted': function () {
                        $('.pac-item, .pac-item span', this).addClass('needsclick');
                        $(".pac-container").attr('data-tap-disabled', 'true');
                    }
                }, '.pac-container');
            }

            // Set onchange
            this.connect(this.googleAddressInput, 'onchange', lang.hitch(this, function (e) {
                if (this.googleAddressInput.value === "") {
                    // Reset all address info first
                    this._contextObj.set(this.attrLatitude, null);
                    this._contextObj.set(this.attrLongitude, null);
                    this._contextObj.set(this.attrAddress, null);
                    this._UpdateData();
                }
            }));                                        
        },
        
        _setupParams: function(){
            if (google.maps.places && this.autocomplete == null) {
                if (this.countryLimRetrieve) {
                    // Retrieve country from microflow
                    logger.debug(this.id + "._setupParams Retrieve countries from " + this.countryLimRetrieve);

                    if(this._contextObj){
                        try{
                            mx.data.action({
                                params: {
                                    applyto: 'selection',
                                    actionname: this.countryLimRetrieve,
                                    guids: [this._contextObj.getGuid()]
                                },
                                callback:lang.hitch(this, this._setupAutocomplete),
                                error: lang.hitch(this, function (error) {
                                    console.log(this.id + "._setupParams: An error occurred while executing microflow: " + error.description);
                                })
                            }, this);
                        } catch(error) {
                            console.log(this.id + "._setupParams: An error occurred while executing microflow: " + error.description);
                        }
                    } else {
                        logger.debug(this.id + "._setupParams skip country limitation from: " + this.countryLimRetrieve);
                    }

                } else {
                    this._setupAutocomplete(this.countryLimitation);
                }
            }
        },

        _setupAutocomplete: function (countrylist) {
            logger.debug(this.id + "._setupAutocomplete");
            if (this.autocomplete == null) {
                logger.debug(this.id + "._setupAutocomplete Instantiate google with countries " + countrylist);
                
                // Initialize the google maps function for the first time                     
                try {
                    // Initiate the autocomplete function    
                    this.autocomplete = new google.maps.places.Autocomplete(this.googleAddressInput);
                    if (countrylist) {
                        this.autocomplete.setComponentRestrictions({
                            'country': countrylist.split(",")
                        });
                    }

                    // Set event handler when something is selected.      autocomplete                  
                    this.autocomplete.addListener("place_changed", lang.hitch(this, this._inputEvent));
                } catch (err) {
                    this._addValidation("Failed to build google: " + err.message);
                }
            }
        },

        _inputEvent: function () {
            this._ResetValues();
            // Get the place details from the autocomplete object.             
            if (this.googleAddressInput.value !== "") {
                var place = this.autocomplete.getPlace();

                // Set GPS information
                if (place.geometry !== undefined) {
                    var lat = place.geometry.location.lat(),
                        lng = place.geometry.location.lng(),
                        componentForm = {
                            street_number: "short_name",
                            route: "long_name",
                            locality: "long_name",
                            postal_code: "short_name",
                            country: this.countryName
                        };

                    this._contextObj.set(this.attrLatitude, lat.toPrecision(8));
                    this._contextObj.set(this.attrLongitude, lng.toPrecision(8));
                    
                    this._checkAttribute({route: "long_name"}, place.address_components, this._contextObj, this.attrStreet);
                    this._checkAttribute({locality: "long_name", sublocality: "long_name"}, place.address_components, this._contextObj, this.attrCity);
                    this._checkAttribute({street_number: "short_name"}, place.address_components, this._contextObj, this.attrHouseNr);
                    this._checkAttribute({postal_code: "short_name"}, place.address_components, this._contextObj, this.attrPostalcode);
                    this._checkAttribute({country: this.countryName}, place.address_components, this._contextObj, this.attrCountry);
                    
                    if(this.attrRaw)
                        this._contextObj.set(this.attrRaw, JSON.stringify(place.address_components));
                }
            }
            this._UpdateData();
        },
        
        // key-value pairs {locality: "long_name", sublocality : "long_name"}
        _checkAttribute: function(componentForm, data, obj, attr){
            if(attr && componentForm){ // No attribute = nothing to store
                // Check for each type the required value for the attribute
                var value = null;
                
                for(var key in componentForm){ // Check per configurred component
                    for (var i = 0; i < data.length; i++) { // Check data element of google
                        for (var e = 0; e < data[i].types.length; e++) { // Check per data element per type of google
                            var addressType = data[i].types[e];
                            if(addressType == key){
                                value = data[i][componentForm[key]];
                                break;
                            }
                            if(value)
                                break;
                        }
                    }
                    
                    if(value)
                        break;
                }
                
                logger.debug(this.id + "._checkAttribute Set " + attr + " - " + value);
                obj.set(attr, value);
            }
        },

        _UpdateData: function () {
            // Function from mendix object to set an attribute.
            if (this._contextObj) {
                this._SetValue(this.attrAddress, this.googleAddressInput.value);
                if (this.mfOnchange) {
                    mx.data.action({
                        params: {
                            applyto: 'selection',
                            actionname: this.mfOnchange,
                            guids: [this._contextObj.getGuid()]
                        },
                        callback: function (obj) {},
                        error: lang.hitch(this, function (error) {
                            console.log(this.id + ': An error occurred while executing microflow: ' + error.description);
                        })
                    }, this);
                }
            }
            this._clearValidations();
        },

        _ResetValues: function () {
            // Reset all address info first
            this._SetValue(this.attrLatitude, null);
            this._SetValue(this.attrLongitude, null);
            this._SetValue(this.attrAddress, null);
            this._SetValue(this.attrStreet, null);
            this._SetValue(this.attrCity, null);
            this._SetValue(this.attrHouseNr, null);
            this._SetValue(this.attrPostalcode, null);
            this._SetValue(this.attrCountry, null);
        },

        _SetValue: function (attr, val) {
            if (!attr && this._contextObj)
                this._contextObj.set(attr, val);
        },

        // Rerender the interface.
        _updateRendering: function () {
            this.googleAddressInput.disabled = this.readOnly;

            if (this._contextObj !== null) {
                if (this.placeholder !== '') {
                    this.googleAddressInput.placeholder = this.placeholder;
                }

                domStyle.set(this.domNode, 'display', 'block');
                this.googleAddressInput.value = this._contextObj.get(this.attrAddress);
            } else {
                domStyle.set(this.domNode, 'display', 'none');
            }

            // Important to clear all validations!
            this._clearValidations();
        },

        // Handle validations.
        _handleValidation: function (_validations) {
            this._clearValidations();

            var _validation = _validations[0],
                _message = _validation.getReasonByAttribute(this.attrAddress);

            if (this.readOnly) {
                _validation.removeAttribute(this.attrAddress);
            } else {
                if (_message) {
                    this._addValidation(_message);
                    _validation.removeAttribute(this.attrAddress);
                }
            }
        },

        // Clear validations.
        _clearValidations: function () {
            domStyle.set(this.googleAddressValidation, 'display', 'none');
        },

        // Add a validation.
        _addValidation: function (message) {
            html.set(this.googleAddressValidation, message);
            domStyle.set(this.googleAddressValidation, 'display', 'block');
            return true;
        },

        // Reset subscriptions.
        _resetSubscriptions: function () {
            var _objectHandle = null,
                _attrHandle = null,
                _validationHandle = null;

            // Release handles on previous object, if any.
            if (this._handles) {
                this._handles.forEach(function (handle, i) {
                    mx.data.unsubscribe(handle);
                });
                this._handles = [];
            }

            // When a mendix object exists create subscribtions. 
            if (this._contextObj) {

                _objectHandle = this.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: lang.hitch(this, function (guid) {
                        this._updateRendering();
                    })
                });

                _attrHandle = this.subscribe({
                    guid: this._contextObj.getGuid(),
                    attr: this.attrAddress,
                    callback: lang.hitch(this, function (guid, attr, attrValue) {
                        this._updateRendering();
                    })
                });

                _validationHandle = this.subscribe({
                    guid: this._contextObj.getGuid(),
                    val: true,
                    callback: lang.hitch(this, this._handleValidation)
                });

                this._handles = [_objectHandle, _attrHandle, _validationHandle];
            }
        }
    });
});
require(['GoogleAutocomplete/widget/GoogleAutocomplete'], function () {
    'use strict';
});
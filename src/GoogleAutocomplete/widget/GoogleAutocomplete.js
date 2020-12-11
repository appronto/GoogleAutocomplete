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
        mfOnchange: "",
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
        autocomplete: "",        

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
            // Load google library
            this._loadGoogle();            
            // Visual rendering according mendix
            this._updateRendering();
        },
        
        executeloading : function()
        {
            this._setupEvents();
        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {
            this._contextObj = obj;
            this._resetSubscriptions();
            this._updateRendering();

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
        _stopBubblingEventOnMobile: function (e) {
        },    
        
         //start Google and create the map
        _loadGoogle: function () {
            logger.debug(this.id + ".LoadGoogle");
            if (google && (!google.maps || (google.maps && !google.maps.places))) {
                var params = (this.apiAccessKey !== "") ? "key=" + this.apiAccessKey + "&libraries=places&v=quarterly" : "libraries=places&v=quarterly";
                
                if (google.loader && google.loader.Secure === false) {
                    google.loader.Secure = true;
                }
                google.load("maps", 3.42, {
                    other_params: params,
                    callback: lang.hitch(this, this._setupEvents)
                });
            } else if (google && google.maps) {
                this._setupEvents();
            }
        },

        // Attach events to HTML dom elements
        _setupEvents: function () 
        {  
            logger.debug(this.id + "._setupEvents");
            if(this.mobileSupport) {
                $(document).on({'DOMNodeInserted': function() {
                        $('.pac-item, .pac-item span', this).addClass('needsclick');
                        $(".pac-container").attr('data-tap-disabled', 'true');
                    }
                }, '.pac-container'); 
            }
            
            // Set onchange
            this.connect(this.googleAddressInput, 'onchange', lang.hitch(this, function(e) {
                if(this.googleAddressInput.value === "")
                {
                    // Reset all address info first
                    this._contextObj.set(this.attrLatitude, null);
                    this._contextObj.set(this.attrLongitude, null);
                    this._contextObj.set(this.attrAddress, null);
                    this._UpdateData();
                }
            })); 
            
            // Set autocomplete parameter with google                        
            this.connect(this.googleAddressInput, 'onfocus', function (e) {
                if(this.autocomplete === '')
                {
                    // Initialize the google maps function for the first time                     
                    try {                       
                        // Initiate the autocomplete function    
                        this.autocomplete = new google.maps.places.Autocomplete(this.googleAddressInput);  
                        if(this.countryLimitation) {
                            this.autocomplete.setComponentRestrictions({'country': this.countryLimitation.split(",")});                            
                        }

                        // Set event handler when something is selected.      autocomplete                  
                        this.autocomplete.addListener("place_changed",lang.hitch(this, this._inputEvent)); 
                    } catch(err) {
                        this._addValidation("Failed to build google: " + err.message);
                    }
                }
            });                                                
        },  
        
        _inputEvent: function()
        {
            this._ResetValues();
            // Get the place details from the autocomplete object.             
            if(this.googleAddressInput.value !== "")
            {
                var place = this.autocomplete.getPlace();

                // Set GPS information
                if(place.geometry !== undefined){
                    var lat = place.geometry.location.lat(),
                        lng = place.geometry.location.lng(),
                        componentForm = {
                          street_number: 'short_name',
                          route: 'long_name',
                          locality: 'long_name',
                          postal_code: 'short_name',
                          country: 'long_name'
                        };
                    
                    this._contextObj.set(this.attrLatitude, lat.toPrecision(8));
                    this._contextObj.set(this.attrLongitude, lng.toPrecision(8));

                    for (var i = 0; i < place.address_components.length; i++) 
                    {
                        var addressType = place.address_components[i].types[0];  
                        console.log('check ' + addressType);
                        if (componentForm[addressType]) 
                        {
                            var val = place.address_components[i][componentForm[addressType]];  
                            
                            var attribute = '';
                            if(addressType == 'route' && this.attrStreet !== ''){
                                attribute = this.attrStreet;
                            } else if(addressType == 'locality' && this.attrCity !== ''){
                                attribute = this.attrCity;
                            } else if(addressType == 'street_number' && this.attrHouseNr !== ''){
                                attribute = this.attrHouseNr;
                            } else if(addressType == 'postal_code' && this.attrPostalcode !== ''){
                                attribute = this.attrPostalcode;
                            } else if(addressType == 'country' && this.attrCountry !== ''){
                                attribute = this.attrCountry;
                            }
                            
                            //console.log(val+'-'+addressType+'-'+attribute);
                            if(attribute !== '' && val !== ''){
                                logger.debug('Set ' + attribute + ' - ' + val);
                                this._contextObj.set(attribute, val);
                            }                                    
                        }
                    }
                }                        
            }
            this._UpdateData();
        },
        
        _UpdateData: function(){
            // Function from mendix object to set an attribute.
            if(this._contextObj){
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
        
        _ResetValues: function(){
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
        
        _SetValue: function(attr, val){
            if(!attr && this._contextObj)
                this._contextObj.set(attr, val);
        },

        // Rerender the interface.
        _updateRendering: function () {
            this.googleAddressInput.disabled = this.readOnly;
            
            if (this._contextObj !== null) {
                if(this.placeholder !== ''){
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
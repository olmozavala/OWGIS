goog.provide('owgis');

goog.require('ol.Map');
goog.require('ol.View');
goog.require('ol.coordinate');
goog.require('ol.layer.Tile');
goog.require('ol.source.TileJSON');
goog.require('ol.source.TileWMS');
goog.require('ol.source.MapQuest');
goog.require('ol.proj');
goog.require('ol.Overlay');
goog.require('ol.control.MousePosition');
goog.require('ol.control.ScaleLine');
goog.require('ol.control.FullScreen');
goog.require('ol.control.ZoomSlider');
goog.require('ol.proj.Projection');

goog.require('owgis.ol3');
goog.require('owgis.utils');
goog.require('owgis.layers');
goog.require('owgis.ncwms.transect');
goog.require('owgis.ncwms.animation');
goog.require('owgis.ncwms.palettes');
goog.require('owgis.languages');
goog.require('owgis.kml');
goog.require('owgis.cql');
goog.require('owgis.vector.manager');
goog.require('owgis.optionalLayers');
goog.require('owgis.layouts.draggable');
goog.require('owgis.help.tooltips');
goog.require('owgis.help.main');
goog.require('owgis.transparency');
goog.require('owgis.interf');
goog.require('owgis.ncwms.currents');
goog.require('owgis.ncwms.currents.style');
goog.require('owgis.layer');
goog.require('owgis.cesium');
goog.require('owgis.mobile');

var myWCSpopup; //variable for the small pop window that apears when the user clicks. 
var displayingAnimation = false;//Global variable that helps to disable the palette selection
var hoverDisabled = false; //Used to disable showing the hover texts
var windowWidth = $(window).width();
var _mobileScreenThreshold = 750;
/////////constants
var PROJ_4326 = 'EPSG:4326';
var PROJ_3857 = 'EPSG:3857';

// Add the moment-range library
window['moment-range'].extendMoment(moment);

//Redirect any https request to http
if (window.location.protocol !== "http:") {
	window.location.href = "http:" + window.location.href.substring(window.location.protocol.length);
}

if(!mobile && windowWidth <= _mobileScreenThreshold){
		 window.location.href = window.location.href.split("?")[0]+"?mobile=true";
	 }

/**
 * This function verifies if one exception occured in the parsing of the 
 * XML layers and displays it as a warning.  
 * @returns {undefined}
 */
function displayPrevExceptions(){
	if( warningText !== ""){
		console.log(warningText);
		console.log(warningInfo);
		owgis.error.popover.create(warningText);
	}
}
/**
 * Instructions executed when the page is ready
 */
function owgisMain(){
	displayPrevExceptions();
    //maps
	var intervalOL3 = setInterval(function(){
        clearInterval(intervalOL3);
        initOl3();
        addLayers();
        owgis.layers.initMainLayer(eval('layer'+_id_first_main_layer));
        //owgis.ol3.positionMap();        
		//If cesium is enabled check to redraw the streamlines
		if(!_.isEmpty(_cesium) && _cesium.getEnabled()){
			if(_mainlayer_streamlines){
				owgis.ncwms.currents.startSingleDateAnimation();
			}
		}
    }, 10);
    //menus
    var intervalMenus = setInterval(function(){
       clearInterval(intervalMenus);
       initMenus();
        owgis.help.tooltips.initHelpTexts();
        modifyInterface();
        if(mobile){
            owgis.mobile.initMobile();
        }
        //Start the currents animation of 'static' day.
        if(_mainlayer_streamlines){
            owgis.ncwms.currents.startSingleDateAnimation();
        }
        //Enables the 'close' behaviour of some windows. 
        $(".glyphicon-remove").parent().on("click",function(event){
            if($(event.currentTarget).parents("#currentsControlsContainer").length > 0){
                owgis.layouts.draggable.topmenu.toogleUse(".currentsParent");
            }
            if($(event.currentTarget).parents("#paletteWindowColorRange").length > 0){
                owgis.layouts.draggable.topmenu.toogleUse(".palettesMenuParent");
            }
            if($(event.currentTarget).parents(".helpInstructionsParentTable").length > 0){
                owgis.layouts.draggable.topmenu.toogleUse(".helpParent");
            }
        });
        //*configure map to look just like last time*//
        //check if last depth selected by user also exists in this layer                    
        isthereelev = noElevation();
        if(!isthereelev && typeof localStorage.depth !== 'undefined'){
            if(typeof $(":radio[value='"+localStorage.depth+"']")[0] !== 'undefined'){
                $(":radio[value='"+localStorage.depth+"']")[0].onclick();
                $( "#"+$(":radio[value='"+localStorage.depth+"']")[0].id).attr('checked',true);
            }
        }
        //set transparency
        if(localStorage.transparency_layer !== 'NaN' && typeof localStorage.transparency_layer !== 'undefined' && localStorage.transparency_layer !== .95 ){
            owgis.transparency.changeTransp(parseFloat(localStorage.transparency_layer));
        }
        //if 3d was set, make it 3d
        if(typeof localStorage.cesium !== 'undefined'){
            if(localStorage.cesium == "true"){
                owgis.cesium.toogleCesium();
            }
        }
        
        
    }, 10);
}

/**
 * Initializes the calendars with the details of the active layer
 */
function initMenus() {
	
	owgis.languages.buildselection();//Initializes the dropdown of languages
	owgis.backlayers.buildselection();//Initializes the dropdown of backlayers
                
    disbleEnterKey(); //disable enter button
    owgis.layouts.draggable.init(); // Make the proper windows draggable.
	
    if (netcdf) {
        //load the palettes
        owgis.ncwms.palettes.loadPalettes();
        initCalendars();
		if(_mainlayer_zaxisCoord){
			owgis.ncwms.zaxis.createElevationSelector(); //initialize depth selector
		}
		owgis.ncwms.animation.initAnimationControls();
		if(_mainlayer_streamlines){
			owgis.ncwms.currents.style.init();
		}
    } 
	
    owgis.kml.updateTitleAndKmlLink();//Updates the title of the layer adding the time and depth of the layer
    updateMenusDisplayVisibility("default");
	if(mobile == false){
            owgis.layouts.draggable.draggableUserPositionAndVisibility();//moves the draggable windows to where the user last left them. 
            $('#backLayersDropDown').selectpicker();
	}else{
            //owgis.ol3.positionMap();
            //if user changes the window size
            //window.addEventListener('orientationchange', doOnOrientationChange);
            resizeMobilePanels();
	}	
	
	//This is the resize function
	$(window).resize(function() {
	   	windowWidth = $(window).width();
		
		//In this case we go beyond the smaller size the window can have for destkop use
		if(!mobile && windowWidth <= _mobileScreenThreshold ){
	   		if (map !== null) {
	   	    	if(!mobile){
	   	    		owgis.layouts.draggable.saveAllWindowPositionsAndVisualizationStatus();
	   	    		getElementById("mobile").value = true;
	   	    	}
	   	        submitForm();
	   	    }
		}
		if(mobile){
			// In this case we are increasing the size of the window and go to desktop mode
                        console.log('mobile');
			if(windowWidth >= _mobileScreenThreshold){
				getElementById("mobile").value = false;
				submitForm();
			}
			owgis.mobile.update();//If is only resizing in mobile then we need to udpate the map
		}
		owgis.layouts.draggable.repositionDraggablesByScreenSize();

		//If cesium is enabled check to redraw the streamlines
		if(!_.isEmpty(_cesium) && _cesium.getEnabled()){
			if(_mainlayer_streamlines){
				owgis.ncwms.currents.startSingleDateAnimation();
			}
		}

		//Try to update the position of the horizontal palette (only for ncWMStwo)
		owgis.ncwms.palettes.updateHorizontalPalette();

	});
}

function resizeMobilePanels(){
 	windowHeight = $(window).height();
	if(windowHeight <= 500){
		$("#panel2, #panel3").css("top","60px");
		$("#panel2, #panel3").css("overflow-y","scroll");
		$("#panel2, #panel3").css("max-height","200px");
	}else{
		$("#panel2, #panel3").css("overflow-y","");
		$("#panel2, #panel3").css("max-height","");
	}
}

function doOnOrientationChange()
{
	switch(window.orientation) 
	{  
		case -90:
		case 90:
			console.log('Orientation change');
//			resizeMobilePanels()
			break; 
		default:
			console.log('Orientation change');
//			$("#panel2, #panel3").css("overflow-y","");
//			$("#panel2, #panel3").css("max-height","");
			break; 
	}
}

/**
 * This function disables the enter button for the user
 * The reason this function was created is becuase for some reason
 * the page reloads whenever the user clicks the enter in the maxPalVal input
 * box, also when a calendar date is selected and enter is pressed the page reloads, so we disable it. 
 */
function disbleEnterKey()
{
    $('html').on('keypress', function(e) {
        if (e.keyCode === 13) {
            return false;
        }
    });
}

/**
 * Updates the time and elevation of the map title
 *@param dateText - date string
 *@param elevText - current depth of the displayed layer
 *
 */
function updateTitle(dateText, elevText) {
	
    //This symbol indicates when does the date and elevation text start
	
    if ((dateText !== "") || (elevText !== "")) {
		
        var endDate = " ";
		
        if (typeof calEnd !== 'undefined') {
            var locendSel = calEnd.selection.get();
            varrlocendDate = Calendar.intToDate(locendSel);
            endDate = "/" + Calendar.printDate(locendDate, '%d-%B-%Y');
        }
		
        if(!(owgis.ncwms.animation.animStatus === "none") )//falta hacer lo de resolution langauge y end date
        {
            $('#pTitleSubText').html(dateText + endDate + elevText);
        }
        else {
            $('#pTitleSubText').html(dateText + elevText);
        }
    }
}

/**
 * 
 * This function creates some input tags of the html form that are 
 * hidden to the user, it is used to pass in information to the java program to 
 * tell them some changes of the user, like the position of a draggable window or the zoom level of the map
 * 
 */

function MapViewersubmitForm() {
    if(localStorage.language !== _curr_language){
        $("#_locale").val(localStorage.language);
    }else if(_curr_language == localStorage.language){
        $("#_locale").val(_curr_language);
    }
    if (map !== null) {
        owgis.layouts.draggable.saveAllWindowPositionsAndVisualizationStatus();
    	if(!mobile){ 
    	    localStorage.zoom = Math.ceil(ol3view.getZoom());// Zoom of map
            //localStorage.map_center =  ol3view.getCenter();// Center of the map
            localStorage.map_center = (_map_projection == 'EPSG:4326') ? ol3view.getCenter() : ol.proj.transform(ol3view.getCenter(), 'EPSG:3857', 'EPSG:4326') ;
            localStorage.language = _curr_language;
            localStorage.projection = _map_projection;
            localStorage.map_palette = mappalette;
            var radioButtons = $('input[name^="elev_select"]:checked');
            if(typeof radioButtons[0] !== 'undefined'){ localStorage.depth = radioButtons[0].value; }
            if(typeof _cesium !== 'undefined'){ localStorage.cesium = _cesium.getEnabled(); }
            localStorage.transparency = owgis.transparency.getTransp();
            localStorage.particles_num = owgis.ncwms.currents.particles.getNumParticles();
            localStorage.particles_speed = owgis.ncwms.currents.particles.getParticleSpeed();
            localStorage.particles_lifetime = owgis.ncwms.currents.particles.getParticlesLifeTime();
            localStorage.particles_color = owgis.ncwms.currents.getColor();
            document.getElementById("mobile").value = mobile;
    	}
        submitForm();
    }
}

/**
 * Change optionallayers + and - button colors
 * @param btn -   button id
 * @param pos - which color. 
 */
function changeText(btn, pos) {
    switch (pos) {
        // When the mouse is not over and is not being clicked
        case 0:
            btn.style.color = "white";
            break;
		// When the mouse is over
        case 1:
            btn.style.color = "#36DC2C";
            break;
		// When the button is being clicked
        case 2:
            btn.style.color = "#33982D";
            break;
		// When the button is disabled
        case 3:
            btn.style.color = "gray";
            break;
    }
}

/**
 * This function is used to reset all the paramenters
 * of the interface, like the positionso of the windows,
 * and center of the map.
 */
function resetView(){
    localStorage.clear();
    submitForm();
}

function getElementById(id){
	return $('#'+id)[0];
}

goog.exportSymbol('owgis',owgis);

/*
 * This function paint a circle in map
 * the funcion returned remove the circle
 * from the map.
 */
function paintClircleOnMap(posY, posX, fun) {
    var mapElement = document.getElementById("map");
    var clickElement = document.createElement("div");
    clickElement.style.top = posY + "px";
    clickElement.style.left = posX + "px";
    clickElement.classList.add("click");
    var done = function(param) {
        if(clickElement.parentNode === mapElement) {
            mapElement.removeChild(clickElement);
        }
        if(typeof(fun) === "function") {
            fun(param);
        }
    };
    mapElement.appendChild(clickElement);
    return done;
}

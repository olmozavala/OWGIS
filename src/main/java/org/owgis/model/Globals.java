/*
* Copyright (c) 2013 Olmo Zavala
* Permission is hereby granted, free of charge, to any person obtaining a copy of 
* this software and associated documentation files (the "Software"), to deal in the 
* Software without restriction, including without limitation the rights to use, copy, 
* modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and 
* to permit persons to whom the Software is furnished to do so, subject to the following conditions: 
* The above copyright notice and this permission notice shall be included in all copies or substantial 
* portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
* INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
* PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE 
* FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, 
* ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. 
*/
package org.owgis.model;

/**
 * This class contains static properties of the paths of the proyect. For example
 * it contains the path where the images of the proyect are stored.
 * @author Olmo Zavala Romero
 */
public class Globals {
    
    //JS
    public static String JS_PATH = "/common/JS/";
    //images
    public static String IMG_PATH="/common/images/";
    //CSS
    public static String CSS_PATH="/common/CSS/";
    //fLASH
    public static String FL_PATH="common/flash/";
    //Pages path    
    public static String PAGES_PATH="/Pages/";

	public String getImagesPath(){
		return IMG_PATH;
	}
			
}


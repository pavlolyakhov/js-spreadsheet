function dataView(tableParentId, scrollElementId, numberOfGridRows, numberOfGridColumns, readonly) {
    const rootId = $('#' + tableParentId + '');
    let dataSource = {};
    const self = this;
    let logger;

    const dragSelectCoordinates = { startCol: 0, startRow: 1, endCol: 0, endRow: 1 };
    let selectedData = [];                // object containing data selected by user

    const scrollElement = $('#' + scrollElementId + '');
    let adaptedData = {};   //[{val:"", row:"", cell:""}]
    let adaptedSortedData = {};
    let visibleTableHeight;
    const loadedItems = {
        firstRow: 0,
        lastRow: 0
    };

    const HIDDEN_FIELDS = tableParentId + "_" + "hiddenFileds";
    const CLEAR_FILTERS = "Clear Filters";
    const SAVE_ALL = "Save All";
    const CONFIRM = "Confirm";
    const CONFIRM_SELECTED = "Confirm Selected";
    const PASTE = "Paste";
    const COPY = "Copy";
    const DELETE_ROW = "Delete row";
    const UNDELETE_ROW = "Un-delete row";
    const EDIT_MODE = "Edit Mode";
    const READONLY_MODE = "Readonly Mode";
    const readonlyMode = (readonly == 1) ? READONLY_MODE : EDIT_MODE;
    const UNHIDE_FIELDS = "Un-Hide Fields";

    let filteredDataSource = {};            //this data will be used to rebuild UI after sorting/filtering
    let filtersSet = false;                 //not used for now.
    let sortedMasterData = {};              //this data is sorted data, will be used when isSorted = true;
    let isSorted = false;                   //this flag is set to true when user clicks any sorting icons
    let gridSize = numberOfGridRows || 50000;
    let gridLength = numberOfGridColumns || 30;
    const gridHistory = [];
    let grid = {};                          //holds references to every <TR> for the whole grid.   Updating td element here will update the DOM automaticaly.
    let indexOfVisible = [];
    const changesMask = {};                 // all changes to data are stored in this mask

    // TEMPLATES //

    const contextMenuTemplate = `<div class="dataview-context-menu"><ul>
    <li><span class ="btnCommit">${CONFIRM}</span></li>
    <li><span class ="btnCommitAll">${CONFIRM_SELECTED}</span></li>
    <li><span class ="btnCopySelection">${COPY}</span></li>
    <li><span class ="btnPasteSelection">${PASTE}</span></li>
    <li><span class ="btnDeleteSelectedRow">${DELETE_ROW}</span></li>
    </ul></div>`;


    const contextMenu = $(contextMenuTemplate);
    $('body').prepend(contextMenu);


    const tableTemplate = `<table class="table table-condensed dataViewTable"><thead><tr class="dataviewHeader"><th>
    <div class ="btn-group">
        <button type="button" class ="vfbtn dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
            <span class ="glyphicon glyphicon-wrench"></span>
        </button>
        <ul class ="dropdown-menu dataview-configButton">
        <li><span class ="btnClearFilters">${CLEAR_FILTERS}</span></li>
        <li><span class="btnSaveAll">${SAVE_ALL}</span></li>
        <li><span class ="editMode">${readonlyMode}</span></li>
        <li><span class ="unHideFields">${UNHIDE_FIELDS}</span></li>
        <li role="separator" class ="divider"></li>
        </ul>
    </div>
    </th></tr></thead><tbody class="dataviewBody"></tbody></table>`;
    const newTable = $(tableTemplate);


    const rowTemplate = '<tr class="dv-datarow"></tr>';


    const rowHeaderTemplate = `<th class="tableHeader"><div class="dataview-header-content"><span class="sortHeader"></span></div>
                            <div class="dataview-header-resizable" draggable="false">&nbsp</div></th>`;


    const headerMenuTemplate = `<div class="input-group">
    <input class="filterHeader" placeholder="filter" />
    <div class="input-group-btn">
    <button class ="ddlHeaderMenuBtn  dropdown-toggle" type="button" id="dropdownMenu1" data-toggle="dropdown" aria-haspopup="true" aria-expanded="true">
        <span class ="caret"></span>
        </button>
        <ul class ="dropdown-menu" aria-labelledby="dropdownMenu1">
        <li><span class ="glyphicon glyphicon-sort-by-alphabet vf-icon sortIconAtoZ"></span>Sort A to Z</li>
        <li><span class ="glyphicon glyphicon glyphicon-sort-by-alphabet-alt vf-icon sortIconZtoA"></span>Sort Z to A</li>
        <li><span class ="glyphicon glyphicon-eye-close vf-icon hideColumn"></span>Hide Column</li>
        <li role="separator" class ="divider"></li>
        <li><a href="#">Something else</a></li>
        </ul>
        </div>
    </div>`;



    // FUNCTIONS //




    // FITLTER RENDER VIEW - the key function that is triggerd by sorting, paging etc, to rebuild the view

    function filterView() {
        const filterViewPromise = new Promise(function (resolve, reject) {
            const resolveFilterPromise = function () {
                resolve();
            }
            const allActiveFilters = $(newTable).find('.filterHeader').filter(function () { return this.value !== '' }).parent().parent();
            (allActiveFilters.length) ? filtersSet = true : filtersSet = false;  //set flag so dataView object knows about its filtering state
            const activeFiltersArr = [];
            if (filtersSet) {
                $.each(allActiveFilters, function (index, value) {
                    const colName = $(value).find('.sortHeader').html();
                    const filterValue = $(value).find('.filterHeader').val().toLowerCase();
                    const fieldIndex = $(value).find('.sortHeader').data('fieldindex');
                    activeFiltersArr.push({ "colname": colName, "filterValue": filterValue, "fieldIndex": fieldIndex })
                });
            }
            if (!filtersSet) {                                  // if all filters are cleared rebuild the view based on isSorted flag.
                if (isSorted) {
                    adaptedSortedData = pivotSortedData(sortedMasterData);
                    buildDom(adaptedSortedData, resolveFilterPromise, true)
                } else {
                    buildDom(adaptedData, resolveFilterPromise, true);          // null -> show all
                }
            }
            else {
                const filteredDataSource = filterDataForView(activeFiltersArr);
                buildDom(filteredDataSource, resolveFilterPromise, true);
            }
        });
        return filterViewPromise;
    }


    function findCommonElements(arrs) {
        if (arrs.length == 1) {
            return arrs[0];
        }
        else if (arrs.length == 0) {
            return [];
        }
        else {
            return _.intersection.apply(null, arrs);
        }
    }

    // this function updates filteredDataSource, but not actrually re-renders the screen
    function filterDataForView(activeFiltersArr) {
        let adaptedTemp;
        let clonedSourceData = {};
        if (isSorted) {
            clonedSourceData = cloneDataSource(sortedMasterData);
            adaptedTemp = adaptedSortedData;
        } else {
            clonedSourceData = cloneDataSource(dataSource);
            adaptedTemp = adaptedData;
        }

        const indexesOfFoundArr = [];
        activeFiltersArr.forEach(function (filter) {
            const tempVisibleArr = [];
            const elementValueLowercase = filter.filterValue;
            clonedSourceData[filter.fieldIndex].Values.forEach(function (item, rowIndex) {
                if (isSorted) {
                    if (item.val && item.val.toLowerCase().indexOf(elementValueLowercase) > -1) {           // non-case sensitive search
                        tempVisibleArr.push(rowIndex);
                    }
                }
                else {
                    if (item && item.toLowerCase().indexOf(elementValueLowercase) > -1) {           // non-case sensitive search
                        tempVisibleArr.push(rowIndex);
                    }
                }
            });
            indexesOfFoundArr.push(tempVisibleArr);
        });
        commonFoundIndexesForAllFilters = findCommonElements(indexesOfFoundArr);

        filteredDataSource = {};

        commonFoundIndexesForAllFilters.forEach(function (value, i) {
            filteredDataSource[i] = adaptedTemp[value];
        });
        return filteredDataSource;
    }


    // SORTING
    function sortSource(colIndex, isDescending) {
        isSorted = true;
        let sortDirection = isDescending || false;                      // false for ASC sorting

        const clonedSourceData = cloneDataSource(dataSource);           // always use original unsorted, unfiltered data
        let sortedFieldArray = clonedSourceData[colIndex].Values.slice(0);  //slice(0) - creates new array
        if (!sortDirection) {                                           //LETTERS ASC
            sortedFieldArray.sort(function (a, b) {
                return a.toLowerCase().localeCompare(b.toLowerCase());
            });
        }
        else if (sortDirection) {
            sortedFieldArray.sort(function (a, b) {
                return b.toLowerCase().localeCompare(a.toLowerCase());
            });
        }
        else {
            sortedFieldArray.sort();                                    //DEFAULT SORT LETTERS ASC 
        }

        const dataForSorting = cloneDataSource(clonedSourceData);       // to avoid bugs when sorting duplicates, need to remove values that were found.
        let sortResultMap = [];
        sortedFieldArray.forEach(function (item) {                      // iterate over sorted column, build mapping array of what index this item had before sorting
            let index = dataForSorting[colIndex].Values.indexOf(item);  // old index. dataSource - is original not sorted array
            dataForSorting[colIndex].Values[index] = "`|";              // replace found value with something that will unlikelly to be present in data. To avoid sorting duplicates issue.
            sortResultMap.push(index);                                  // add all previous indexes into array
        });
        //console.log('sortResultMap');
        //console.log(sortResultMap);

        //console.log('clonedSourceData');
        //console.log(clonedSourceData);
        const sortedDataSource = clonedSourceData.slice(0);             

        clonedSourceData.forEach(function (field, index) {                      // for each column
            let tempArr = [];
            let tempFieldValues = field.Values.slice(0);                        // clone column array. 
            let cellObj = {};
            sortResultMap.forEach(function (mappingNumber, i) {                 // for each in mapping array, take mapping number and use as index
                let cellValue = field.Values[mappingNumber];                    // the actual data in the cell. cellValue is undefined if no value in the cell
                tempFieldValues.splice(tempFieldValues.indexOf(cellValue), 1);  // remove data cell value from temp array.  only if cellValue is not undefined, in case some columns longer than others or empty value
                cellObj = { val: cellValue, dbRow: mappingNumber, dbFieldName: field.Name };
                tempArr.push(cellObj);
            });
            if (tempFieldValues.length > 0) {                                   // if some columns where longer, they will have more data than in mapping array, so leftovers appended to the end of array
                tempFieldValues.forEach(function (item, itemIndex) {
                    cellObj = { val: item, dbRow: itemIndex, dbFieldName: field.Name };
                    tempArr.push(cellObj);
                });
            };
            sortedDataSource[index].Values = tempArr;                           // assign sorted column. So sortedDataSource becomes a fully sorted clone of clonedSourceData.
        });

        sortedMasterData = cloneDataSource(sortedDataSource);                   // save to sorted store, so filtering process can use it, if isSorted = true
        //console.log('sortedMasterData');
        //console.log(sortedMasterData);
        filteredDataSource = cloneDataSource(sortedDataSource);

        filterView().then(personaliseView());                                   //push data through filter after every sort. this will re-builld the view as well
    }
    //function sortSource(colIndex, isDescending) {
    //    isSorted = true;
    //    let sortDirection = isDescending || false;                      // false for ASC sorting
    //    const clonedSourceData = cloneDataSource(dataSource);           // always use original unsorted, unfiltered data
    //    let sortedFieldArray = clonedSourceData[colIndex].Values.slice(0);  //slice(0) - creates new array
    //    if (!sortDirection) {                                           //LETTERS ASC
    //        sortedFieldArray.sort(function (a, b) {
    //            return a.toLowerCase().localeCompare(b.toLowerCase());
    //        });
    //    }
    //    else if (sortDirection) {
    //        sortedFieldArray.sort(function (a, b) {
    //            return b.toLowerCase().localeCompare(a.toLowerCase());
    //        });
    //    }
    //    else {
    //        sortedFieldArray.sort();                                    //DEFAULT SORT LETTERS ASC 
    //    }
    //    const dataForSorting = cloneDataSource(clonedSourceData);       // to avoid bugs when sorting duplicates, need to remove values that were found.
    //    let sortResultMap = [];
    //    sortedFieldArray.forEach(function (item) {                          // iterate over sorted column, build mapping array of what index this item had before sorting
    //        let index = dataForSorting[colIndex].Values.indexOf(item);  // old index. dataSource - is original not sorted array
    //        dataForSorting[colIndex].Values[index] = "`|";              // replace found value with something that will unlikelly to be present in data. To avoid sorting duplicates issue.
    //        sortResultMap.push(index);                                  // add all previous indexes into array
    //    });
    //    console.log('sortResultMap');
    //    console.log(sortResultMap);
    //    console.log('clonedSourceData');
    //    console.log(clonedSourceData);
    //    const sortedDataSource = clonedSourceData.slice(0);
    //    clonedSourceData.forEach(function (field, index) {              //for each column
    //        let tempArr = [];
    //        let tempFieldValues = field.Values.slice(0);                //clone column array. 
    //        sortResultMap.forEach(function (mappingNumber, i) {             // for each in mapping array, take mapping number and use as index
    //            let cellValue = field.Values[mappingNumber];            //the actual data in the cell. cellValue is undefined if no value in the cell
    //            tempFieldValues.splice(tempFieldValues.indexOf(cellValue), 1); // remove data cell value from temp array.  only if cellValue is not undefined, in case some columns longer than others or empty value
    //            tempArr.push(cellValue);
    //        });
    //        if (tempFieldValues.length > 0) {                                   //if some columns where longer, they will have more data than in mapping array, so leftovers appended to the end of array
    //            tempFieldValues.map(function (item) {
    //                tempArr.push(item);
    //            });
    //        };
    //        sortedDataSource[index].Values = tempArr;                           //assign sorted column. So sortedDataSource becomes a fully sorted clone of clonedSourceData.
    //    });
    //    sortedMasterData = cloneDataSource(sortedDataSource);                   //save to sorted store, so filtering process can use it, if isSorted = true
    //    console.log('sortedMasterData');
    //    console.log(sortedMasterData);
    //    filteredDataSource = cloneDataSource(sortedDataSource);
    //    filterView().then(personaliseView());                                   //push data through filter after every sort. this will re-builld the view as well
    //}
    
    function personaliseView() {
        let hiddenFields = localStorage.getItem(HIDDEN_FIELDS);
        if (hiddenFields) {
            const hiddenFieldsArr = JSON.parse(hiddenFields);
            if (hiddenFieldsArr.constructor === Array) {
                hiddenFieldsArr.forEach(function (field) {
                    _.mapKeys(grid, function (value, index) {
                        $(value[field]).hide();
                    });
                    const headerNumber = field + 1
                    newTable.find("tr.dataviewHeader th:nth-child(" + headerNumber + ")").hide();
                })
            }
        }
    }

    function handleHideField(th, i, fadeSpeed) {
        $(th).fadeOut(fadeSpeed+500);
        _.mapKeys(grid, function (value, index) {
            $(value[i]).fadeOut(fadeSpeed);
        });
        let tempArr = [];
        function storeHiddenFields(tempArr) {
            if (!tempArr.constructor === Array) {
                console.error(HIDDEN_FIELDS + " is not an Array");
                return;
            }
            if (tempArr.indexOf(i) > -1) {
                return;
            }
            tempArr.push(i);
            const tempArrStr = JSON.stringify(tempArr);
            localStorage.setItem(HIDDEN_FIELDS, tempArrStr);
        }

        if (localStorage.getItem(HIDDEN_FIELDS)) {
            tempArr = JSON.parse(localStorage.getItem(HIDDEN_FIELDS));
            storeHiddenFields(tempArr);
        }
        else {
            storeHiddenFields(tempArr);
        }
    }

    // BUILD TABLE HEADER from template //
    function buildHeader(dataSource) {
        rootId.append(newTable);
        for (let i = 0; i < gridLength; i++) {
            const fieldName = (dataSource[i]) ? dataSource[i].Name : "[empty]";
            const th = $(rowHeaderTemplate).clone();
            const headerMenu = $(headerMenuTemplate).clone();
            $(th).find(".sortHeader").attr("data-fieldindex", i).append(fieldName);
            $(th).find(".dataview-header-content").append(headerMenu);
            $(newTable).find("tr.dataviewHeader").append(th);
            // HEADER EVENTS
            $(th).find('.sortIconAtoZ').on("click", function (e) {
                const colIndex = i;
                sortSource(colIndex, false);
            });
            $(th).find('.sortIconZtoA').on("click", function (e) {
                const colIndex = i;
                sortSource(colIndex, true);
            });
            $(th).find('.hideColumn').on('click', function (e) {
                handleHideField(th, i+1, 1000);
            });
            $(th).find('.filterHeader').on("keyup", function (e) {
                //setTimeout(filterView().then(personaliseView()), 0);
                filterView().then(personaliseView());
            });
            let parent = $(th).parent();
            $(th).find(".dataview-header-resizable").on("mousedown", function (down) {
                let downClientX = down.clientX;
                const thOffsetWidth = down.target.parentNode.offsetWidth;
                $(parent).on("mousemove", function (up) {
                    upClientX = up.clientX;
                    let newWidth = thOffsetWidth + (upClientX - down.clientX);
                    $(th).css("min-width", newWidth);
                });
            });
            $(parent).on('mouseup', function (e) {
                $(parent).off('mousemove');
            })
        };
        countVisibleHeight();
    }
    function countVisibleHeight() {
        const tHead = newTable.find('thead');
        const visibleTabPanelHeight = rootId.prop('clientHeight');
        const tHeadHeight = tHead.prop('clientHeight');
        visibleTableHeight = visibleTabPanelHeight - tHeadHeight;
    }

    // BUILD TABLE FROM Template //
    function buildView(data) {
        rootId.on("scroll", function (e) {
            countVisibleHeight();
            handleScrollDown();
        });
        const buildTablePromise = new Promise(function (resolve, reject) {
            const resolveBuild = function () {
                resolve();
            };
            dataSource = cloneDataSource(data);                         // immutable clone of original data.  dataSource will be used for any sorting, filtering etc...

            buildHeader(dataSource);                                    // build header

            adaptedData = pivotData(dataSource);                        // data from server formatted for use in html table
            //console.log('adaptedData')
            //console.log(adaptedData);

            setTimeout(function () {
                buildDom(adaptedData, resolveBuild, false);             // ADD TABLE ROWS 
            }, 1);
        });
        // ATACHING GRID EVENTS //
        buildTablePromise.then(function () { //attach events when elements created
            if (logger) {
                logger.showSuccess("Data grid finished loading", 1000);
            }
            personaliseView();
            $(newTable).find('.btnClearFilters').on("click", function (e) {
                $(newTable).find('.filterHeader').val("");
                filterView().then(personaliseView());
            });
            $(newTable).find(".editMode").on("click", function (e) {
                const isEditable = ($(this).html() == EDIT_MODE) ? 0 : 1;
                setMode.call(this, isEditable);
            });
            $(newTable).find(".unHideFields").on("click", function (e) {
                console.log("unhide");
                localStorage.removeItem(HIDDEN_FIELDS);
                filterView().then(personaliseView());
                $('.tableHeader').show();
            });
            $(newTable).find('.btnSaveAll').on('click', function (e) {
                console.log('save all');
            });
            $(newTable).on('keyup', '.dv-td-editable', function (e) {
                const val = e.target.innerText;
                const row = $(e.target).data("dbrow");
                const field = $(e.target).data("dbfield");
                const changedVal = { field: field, row: row, val: val };
                let changesForField;
                if(changesMask[field]) {
                    changesForField = changesMask[field];
                } else {
                    changesMask[field] = {};
                    changesForField = changesMask[field];
                }
                changesForField[row] = changedVal;
                console.log('changesMask');
                console.log(changesMask);
            
            });
            setMode(readonlyMode);                                      // set default mode on load
            $(newTable).on('copy', function (e) {
                console.log('copy');
                setSelectedValues();
                var proto = Object.getPrototypeOf(self);
                proto.copiedSelection = getSelected;
                window.copiedSelection = getSelected;                   //parent object is needed to pass copied selection onto another dataview object. Another alternative is to use global window instead of a parent.
                //e.preventDefault();
            });
            $(newTable).bind('paste', function (e) {
                console.log('paste ctrl+v');
                pasteDataFrom(e);
                e.preventDefault();
            });
            $(contextMenu).on('click', '.btnCopySelection', function (e) {
                setSelectedValues();
                var proto = Object.getPrototypeOf(self);
                proto.copiedSelection = getSelected;
                window.copiedSelection = getSelected;//          //injecting propperty into window object for storing reference to get selection function. So other objects can get stored values and paste into themselves
            });
            $(contextMenu).on('click', '.btnPasteSelection', function (e) {
                console.log('paste button');
                pasteDataFrom(e);
            });
            $(contextMenu).on('click', '.btnDeleteSelectedRow', function (e) {
                console.log('delete row button');
                deleteRow(e);
            });
            $(document).on('click', function (e) {              //hide Context menu
                setTimeout(function () {
                    if ($(contextMenu).is(":visible")) {
                        $(contextMenu).hide();
                    }
                }, 0)
            });
            $(newTable).on('focus', 'td.dv-td-editable', function (e) {
                $(this).on('keydown', function (event) {
                    var keyCode = event.which;
                    var colNumber = $(event.target).attr("data-col");
                    var rowNumber = $(event.target).attr("data-row");
                    if (keyCode == 38) {                                                    // Arrow Up
                        if (rowNumber > 0) { rowNumber-- };
                        grid[rowNumber][colNumber][0].focus();
                    }
                    else if (keyCode == 40) {                                               // Arrow Down
                        if (rowNumber < loadedItems.lastRow-1) { rowNumber++ }

                        grid[rowNumber][colNumber][0].focus();
                    }
                });
            });
        });
    }

    function setMode(mode) {
        if (mode == READONLY_MODE || mode == 1) {
            $(newTable).find("td.dv-td-editable").removeAttr("contenteditable");
            setModeButtonLabel(EDIT_MODE);
        }
        else {
            $(newTable).find("td.dv-td-editable").attr("contenteditable", true);
            setModeButtonLabel(READONLY_MODE);
        }
    }
    function setModeButtonLabel(text) {
        $(newTable).find('span.editMode').html(text);
    }
    function deleteRow(e) {
        var numberOfColSelected = dragSelectCoordinates.endCol - dragSelectCoordinates.startCol;
        var parentTr = $(newTable).find('.dataview-select-row[data-row=' + dragSelectCoordinates.startRow + ']').parent();
        if ($(parentTr).hasClass('dataview-deleted')) {
            $(parentTr).removeClass('dataview-deleted');
        }
        else if (numberOfColSelected == (gridLength - 2) && dragSelectCoordinates.startRow === dragSelectCoordinates.endRow) {       //whole row selected
            console.log(parentTr);
            $(parentTr).addClass('dataview-deleted');
        }

    }
    function pasteDataFrom() {                                  //reference to object from which data is imported
        var proto = Object.getPrototypeOf(self);
        if (proto.copiedSelection) {
            const copiedData = proto.copiedSelection();
            let gridRowIndex = dragSelectCoordinates.startRow;
            for (let row = 0; row < copiedData.length; row++) {
                let gridColIndex = dragSelectCoordinates.startCol;

                for (let col = 0; col < copiedData[row].length; col++) {
                    let value = copiedData[row][col];
                    grid[gridRowIndex][gridColIndex][0].innerHTML = value;

                    gridColIndex++;
                }
                gridRowIndex++;
            }
        }
    }
    function getSelected() {
        console.log('selectedData');
        console.log(selectedData);
        return selectedData;
    }


    // BUILD GRID //
    function buildDom(tableViewDataPivotObj, resolvePromise, clearTable) {
        //console.log('tableViewDataPivotObj');
        //console.log(tableViewDataPivotObj);
        if (clearTable) {
            newTable.find('tbody.dataviewBody').empty();
            loadedItems.lastRow = 0;
            //grid = {};        //make sure its not needed before deleting
        }
        if (visibleTableHeight > 0) {
            loadMoreRows(tableViewDataPivotObj);
        }
        else {
            loadInitialRowsForHiddenTabs(tableViewDataPivotObj, 50);
        }
        if (resolvePromise) resolvePromise();     //this would resolve promise on initial load to add events. This is just for initial load.
    }

    function loadMoreRows(tableViewDataPivotObj) {
        let trHeightsSum = 0;
        while (trHeightsSum <= visibleTableHeight + 200 && loadedItems.lastRow <= gridSize) {
            let tr = $(rowTemplate);
            buildRowWrapper(tableViewDataPivotObj, tr);
            const trHeight = tr.prop('clientHeight');
            trHeightsSum += trHeight;
            loadedItems.lastRow++;
        };
        setMode(readonlyMode);
    };

    function loadInitialRowsForHiddenTabs(tableViewDataPivotObj, minRowsNumber) {
        while (loadedItems.lastRow < minRowsNumber && loadedItems.lastRow < gridSize) {
            let tr = $(rowTemplate);
            buildRowWrapper(tableViewDataPivotObj, tr);
            loadedItems.lastRow++;
        };
    };
    function buildRowWrapper(tableViewDataPivotObj, tr) {
        const row = (tableViewDataPivotObj[loadedItems.lastRow]) ? tableViewDataPivotObj[loadedItems.lastRow] : [];
        buildRow(tr, row, loadedItems.lastRow);
        $(tr).on("mousedown", 'td.dv-td-editable, td.dataview-select-row', function (e) {
            setTimeout(onMouseDown, 0, e);
        });
        $(tr).on("contextmenu", 'td.dv-td-editable, td.dataview-select-row', function (e) {       //Show Context Menu on right-click
            e.preventDefault();
            setTimeout(onContextMenu, 0, e);
        });
        $(tr).on("mouseover", 'td.dv-td-editable', function (e) {
            setTimeout(onMouseOver, 0, e);
        });
        $(tr).on("mouseup", 'td.dv-td-editable', function (e) {
            setTimeout(onMouseUp, 0, e);
        });
        $(newTable).find('tbody.dataviewBody').append(tr);                          // add TR element to the actual DOM.
        
    }
    

    function handleScrollDown() {
        const workPanelHeight = rootId.prop('clientHeight');
        const scrollHeight = newTable.prop('scrollHeight');
        const scrollTop = rootId.prop('scrollTop');
        const scrollBottom = scrollHeight - workPanelHeight - scrollTop;

        if (scrollBottom <= 200) {
            console.log("LOAD MORE");
            if (filtersSet) {
                if (isSorted) {
                    setTimeout(function () {
                        buildDom(sortedMasterData, null, false);          // ADD TABLE ROWS if filters set and sorted
                    }, 1);
                }
                else {
                    setTimeout(function () {
                        buildDom(filteredDataSource, null, false);          // ADD TABLE ROWS if filters set
                    }, 1);
                }
            }
            else {
                if (isSorted) {
                    setTimeout(function () {
                        buildDom(adaptedSortedData, null, false);          // ADD TABLE ROWS if sorted
                    }, 1);
                }
                else {
                    setTimeout(function () {
                        buildDom(adaptedData, null, false);                 // ADD TABLE ROWS 
                    }, 1);
                }
            }
        }
    };

    // BUILD  GRID ROW  //
    function buildRow(trGridReference, rowOfData, gridRowIndex, resolveBuild) {
        const tdCollection = [];
        const tdKey = "" + gridRowIndex + 0;  // 0 -> cell index
        const tdElement = $(document.createElement('td'));
        $(tdElement).removeAttr('contenteditable');
        $(tdElement).addClass('dataview-select-row');
        $(tdElement).attr("data-row", gridRowIndex);
        const dbRowZero = (rowOfData[0]) ? rowOfData[0].dbRow : "";
        $(tdElement).attr("data-dbrow", dbRowZero);
        $(tdElement).attr("data-key", tdKey);
        $(tdElement).html(gridRowIndex + 1);
        $(tdElement).on("click", function (e) {
            setTimeout(handleSelectRowClick, 0, e);
        });
        tdCollection.push(tdElement);
        $(trGridReference).append(tdElement);
        //console.time("buildCell");
        for (let cellIndex = 0; cellIndex < gridLength; cellIndex++) {
            const cellItem = (rowOfData[cellIndex]) ? rowOfData[cellIndex].val : "";
            const tdKey = "" + gridRowIndex + cellIndex + 1;
            const tdElement = $(document.createElement('td'));      //const tdElement = $(cellTemplate);
            $(tdElement).attr('contenteditable');
            $(tdElement).addClass('dv-td-editable');
            $(tdElement).attr("data-row", gridRowIndex);
            const dbRow = (rowOfData[cellIndex]) ? rowOfData[cellIndex].dbRow : "";
            $(tdElement).attr("data-dbrow", dbRow);
            $(tdElement).attr("data-col", cellIndex + 1);
            const dbFieldName = (rowOfData[cellIndex]) ? rowOfData[cellIndex].dbFieldName : "";
            $(tdElement).attr("data-dbfield", dbFieldName);
            $(tdElement).attr("data-key", tdKey);
            $(tdElement).html(cellItem);

            tdCollection.push(tdElement);
            $(trGridReference).append(tdElement);
        }
        //console.timeEnd("buildCell");
        grid[gridRowIndex] = tdCollection;
    }
    //function buildRow(trGridReference, rowOfData, gridRowIndex, resolveBuild) {
    //    const tdCollection = [];
    //    const tdKey = "" + gridRowIndex + 0;  // 0 -> cell index
    //    const tdElement = $(document.createElement('td'));
    //    $(tdElement).removeAttr('contenteditable');
    //    $(tdElement).addClass('dataview-select-row');
    //    $(tdElement).attr("data-row", gridRowIndex);
    //    $(tdElement).attr("data-key", tdKey);
    //    $(tdElement).html(gridRowIndex + 1);
    //    $(tdElement).on("click", function (e) {
    //        setTimeout(handleSelectRowClick, 0, e);
    //    });
    //    tdCollection.push(tdElement);
    //    $(trGridReference).append(tdElement);
    //    //console.time("buildCell");
    //    for (let cellIndex = 0; cellIndex < gridLength; cellIndex++) {
    //        const cellItem = (rowOfData[cellIndex]) ? rowOfData[cellIndex] : "";
    //        const tdKey = "" + gridRowIndex + cellIndex + 1;
    //        const tdElement = $(document.createElement('td'));      //const tdElement = $(cellTemplate);
    //        $(tdElement).attr('contenteditable');
    //        $(tdElement).addClass('dv-td-editable');
    //        $(tdElement).attr("data-row", gridRowIndex);
    //        $(tdElement).attr("data-col", cellIndex + 1);
    //        $(tdElement).attr("data-key", tdKey);
    //        $(tdElement).html(cellItem);

    //        tdCollection.push(tdElement);
    //        $(trGridReference).append(tdElement);
    //    }
    //    //console.timeEnd("buildCell");
    //    grid[gridRowIndex] = tdCollection;
    //}


    function onContextMenu(e) {
        if ($(e.target).hasClass('dataview-select-row')) {
            $(contextMenu).find('.btnCommit').addClass('context-button-disabled');
            const parentTr = $(e.target).parent();
            if ($(parentTr).hasClass("dataview-deleted")) {
                $(contextMenu).find('.btnDeleteSelectedRow').removeClass('context-button-disabled').html(UNDELETE_ROW);
            }
            else {
                $(contextMenu).find('.btnDeleteSelectedRow').removeClass('context-button-disabled').html(DELETE_ROW);
            }
        }
        else {
            $(contextMenu).find('.btnDeleteSelectedRow').addClass('context-button-disabled');
            $(contextMenu).find('.btnCommit').removeClass('context-button-disabled');
        }
        $(contextMenu).css("top", e.pageY - 20 + "px");
        $(contextMenu).css("left", e.pageX + "px");
        $(contextMenu).show();
        return false;
    }

    function handleSelectRowClick(e) {
        dragSelectCoordinates.startCol = 1;
        dragSelectCoordinates.endCol = gridLength - 1;
        dragSelectCoordinates.startRow = $(e.target).data('row');
        dragSelectCoordinates.endRow = $(e.target).data('row');
        paintSquare();

    }
    function onMouseDown(e) {
        //console.log('mousedown');
        if ($(e.target).hasClass('dataview-select-row')) {
            handleSelectRowClick(e)
            return;
        }

        //const isRow = ($(e.target).attr('contenteditable', true)) ? true : false;  dv-td-editable
        const isRow = ($(e.target).hasClass('dv-td-editable')) ? true : false;
        const isSelectedArea = $(e.target).hasClass('dataview-selected-cell');
        if (isRow && (e.buttons == 1 || e.buttons == 3)) {
            dragSelectCoordinates.startCol = $(e.target).data("col");
            dragSelectCoordinates.endCol = $(e.target).data("col");
            dragSelectCoordinates.startRow = $(e.target).data("row");
            dragSelectCoordinates.endRow = $(e.target).data("row");

            paintSquare();
        }
        else if (isRow && e.buttons == 2 && !isSelectedArea) {
            //console.log('right-click');

            dragSelectCoordinates.startCol = $(e.target).data("col");
            dragSelectCoordinates.endCol = $(e.target).data("col");
            dragSelectCoordinates.startRow = $(e.target).data("row");
            dragSelectCoordinates.endRow = $(e.target).data("row");
            paintSquare();
        }

    }
    function onMouseOver(e) {
        //console.log('mouseover');
        if (e.buttons == 1 || e.buttons == 3) {
            $(this).addClass("dataview-selected-cell");
            dragSelectCoordinates.endCol = $(e.target).data("col");
            dragSelectCoordinates.endRow = $(e.target).data("row");
            paintSquare();
        }
    }
    function onMouseUp(e) {
        //setSelectedValues();
    }

    function setSelectedValues() {
        let minRow = dragSelectCoordinates.startRow;
        let maxRow = dragSelectCoordinates.endRow;
        let minCol = dragSelectCoordinates.startCol;
        let maxCol = dragSelectCoordinates.endCol;
        if (dragSelectCoordinates.startRow > dragSelectCoordinates.endRow) {
            minRow = dragSelectCoordinates.endRow;
            maxRow = dragSelectCoordinates.startRow;
        }
        if (dragSelectCoordinates.startCol > dragSelectCoordinates.endCol) {
            minCol = dragSelectCoordinates.endCol;
            maxCol = dragSelectCoordinates.startCol;
        }
        let iRow = 0;
        selectedData = [];
        for (let row = minRow; row <= maxRow; row++) {
            let tempArrRow = [];
            for (let col = minCol; col <= maxCol; col++) {
                tempArrRow.push(grid[row][col][0].innerHTML);
            }
            selectedData[iRow] = tempArrRow;
            iRow++;
        }
    }



    function paintSquare() {
        let minCol, maxCol, minRow, maxRow;
        if (dragSelectCoordinates.startCol <= dragSelectCoordinates.endCol) {
            minCol = dragSelectCoordinates.startCol;
            maxCol = dragSelectCoordinates.endCol;
        }
        else {
            minCol = dragSelectCoordinates.endCol;
            maxCol = dragSelectCoordinates.startCol;
        }

        if (dragSelectCoordinates.startRow <= dragSelectCoordinates.endRow) {
            minRow = dragSelectCoordinates.startRow;
            maxRow = dragSelectCoordinates.endRow;
        }
        else {
            minRow = dragSelectCoordinates.endRow;
            maxRow = dragSelectCoordinates.startRow;
        }
        //
        rootId.find('td.dv-td-editable').removeClass("dataview-selected-cell");
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (!$(grid[row][col]).parent().hasClass('dataview-deleted')) {
                    $(grid[row][col]).addClass("dataview-selected-cell");
                }
            }
        }
    }



    //Create clone
    function cloneDataSource(objToClone) {
        const newClone = _.cloneDeep(objToClone);
        return newClone;
    }



    function getLongestArray(dataSource) {
        let arrayOfLengths = [];
        _.mapKeys(dataSource, function (item) {          //set headers 
            arrayOfLengths.push(item.Values.length);    //to find maximum length, in case some data fields linger than other. e.g. column "B" has more rows than col "A"
        });
        return arrayOfLengths;
    }


    //Trasform source data for row building. Pivot Json data 
    function pivotData(dataSource) {
        //console.time('pivotData');
        const arrayOfLengths = getLongestArray(dataSource);
        var max = Math.max.apply(Math, arrayOfLengths);     //find max in array
        var longestArr = arrayOfLengths.indexOf(max);       //find index of max value. e.g. index of tallest data field
        var tableViewDataPivotObj = {};                //pivoted data final
        dataSource.forEach(function (item) {                //for each row of source data
            for (let index = 0; index < max; index++) {
                const tempObj = {};
                tempObj.val = item.Values[index];       // Cell value
                tempObj.dbRow = index;                  // Row number
                tempObj.dbFieldName = item.Name;        // Column Name

                if (!tableViewDataPivotObj[index]) {        //if resulting object with index doesn't yet have array created
                    let tempArr = [];
                    tempArr.push(tempObj);
                    tableViewDataPivotObj[index] = tempArr;
                }
                else
                {
                    tableViewDataPivotObj[index].push(tempObj);  //find resulting object by index and add to its array
                }
            };
        });
        //console.timeEnd('pivotData');
        //console.log('pivoted');
        //console.log(tableViewDataPivotObj)
        return tableViewDataPivotObj;
    }
    function pivotSortedData(dataSource) {
        //console.time('pivotData');
        const arrayOfLengths = getLongestArray(dataSource);
        var max = Math.max.apply(Math, arrayOfLengths);     //find max in array
        var longestArr = arrayOfLengths.indexOf(max);       //find index of max value. e.g. index of tallest data field
        var tableViewDataPivotObj = {};                //pivoted data final
        dataSource.forEach(function (item) {                //for each row of source data
            for (let index = 0; index < max; index++) {
                const tempObj = {};
                tempObj.val = (item.Values[index])? item.Values[index].val : "";       // Cell value
                tempObj.dbRow = (item.Values[index]) ? item.Values[index].dbRow : index;                  // Row number
                tempObj.dbFieldName = item.Name;        // Column Name

                if (!tableViewDataPivotObj[index]) {        //if resulting object with index doesn't yet have array created
                    let tempArr = [];
                    tempArr.push(tempObj);
                    tableViewDataPivotObj[index] = tempArr;
                }
                else {
                    tableViewDataPivotObj[index].push(tempObj);  //find resulting object by index and add to its array
                }
            };
        });
        //console.timeEnd('pivotData');
        //console.log('pivoted');
        //console.log(tableViewDataPivotObj)
        return tableViewDataPivotObj;
    }
    //function pivotData(dataSource) {
    //    //console.time('pivotData');
    //    const arrayOfLengths = getLongestArray(dataSource);
    //    var max = Math.max.apply(Math, arrayOfLengths);     //find max in array
    //    var longestArr = arrayOfLengths.indexOf(max);       //find index of max value. e.g. index of tallest data field
    //    let tableViewDataPivotObj = {};                     //pivoted data final
    //    dataSource.forEach(function (item) {                //for each row of source data
    //        for (let index = 0; index < max; index++) {
    //            if (!tableViewDataPivotObj[index]) {        //if resulting object with index doesn't yet have array created
    //                let tempArr = []
    //                tempArr.push(item.Values[index]);
    //                tableViewDataPivotObj[index] = tempArr;
    //            }
    //            else {
    //                tableViewDataPivotObj[index].push(item.Values[index]);  //find resulting object by index and add to its array
    //            }
    //        };
    //    });
    //    //console.timeEnd('pivotData');
    //    console.log('pivoted');
    //    console.log(tableViewDataPivotObj)
    //    return tableViewDataPivotObj;
    //}

    function getGrid() {
        return grid;
    }


    function addConfigButtonAction(item) {
        const found = $(newTable).find('ul.dataview-configButton');
        $(newTable).find('ul.dataview-configButton').append(item);
    }


    function addLogger(injectLogger) {
        logger = injectLogger;
    }
    return {
        buildView: buildView,
        addConfigButtonAction: addConfigButtonAction,
        isReadOnly: setMode,
        addLogger: addLogger,
        getGrid:getGrid
    }
}

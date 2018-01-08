(function () {
    const siteView = {};

    $(document).ready(function () {
        
        const table1 = new dataView('tabs-1', 'work-panel', 1500, 15, 0);
        //table1.addLogger(main.uiLogger);
        table1.buildView(jsonDataFormat);

        const table2 = new dataView('tabs-2', 'work-panel', 1000, 20, 0);
        //table2.addLogger(main.uiLogger);
        table2.buildView(jsonDataFormat2);


        siteView.tabs = [table1, table2];

        $('.vftab').on('click', function (e) {
            const tabid = $(this).data("tabid");
            if (!$(this).hasClass('vftab-active')) {
                $('.vftab').removeClass('vftab-active');
                $(this).addClass('vftab-active');

                const divTab = $('#' + tabid + '');
                if (!$(divTab).hasClass('active')) {
                    $('.vftab-pane').removeClass('active');
                    $(divTab).addClass('active');
                }
            }
        });
        const configActionTemplate = `<li><span>Show Import History</span></li>`;
        siteView.tabs.forEach(function (tab, i) {
            const configAction = $(configActionTemplate);
            $(configAction).on('click', function (e) {
                $('#vfdrawer').show();//('slide', { direction: 'right' }, 0);
            });
            tab.addConfigButtonAction(configAction);
        });
        $('.closeVfDrawer').on('click', function (e) {
            $('#vfdrawer').hide();
        });

    });
})();
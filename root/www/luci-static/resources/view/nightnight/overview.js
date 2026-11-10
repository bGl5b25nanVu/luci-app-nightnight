'use strict';
'require view';

return view.extend({
	render: function() {
		return E('div', { style: 'margin: -1rem; height: calc(100vh - 60px);' }, [
			E('iframe', {
				src: '/nightnight/index.html',
				style: 'width: 100%; height: 100%; border: none; background: #fcfbf9;'
			})
		]);
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});

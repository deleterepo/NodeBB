'use strict';


define('topicList', ['infinitescroll', 'handleBack'], function (infinitescroll, handleBack) {
	var TopicList = {};
	var newTopicCount = 0;
	var newPostCount = 0;

	$(window).on('action:ajaxify.start', function (ev, data) {
		if (ajaxify.currentPage !== data.url) {
			TopicList.removeListeners();
		}
	});

	TopicList.init = function () {
		TopicList.watchForNewPosts();

		TopicList.handleCategorySelection();

		if (!config.usePagination) {
			infinitescroll.init(TopicList.loadMoreTopics);
		}

		handleBack.init(function (after, cb) {
			loadTopicsAfter(after, 1, cb);
		});
		$(window).trigger('action:topics.loaded', { topics: ajaxify.data.topics });
	};

	TopicList.watchForNewPosts = function () {
		$('#new-topics-alert').on('click', function () {
			$(this).addClass('hide');
		});
		newPostCount = 0;
		newTopicCount = 0;
		TopicList.removeListeners();
		socket.on('event:new_topic', onNewTopic);
		socket.on('event:new_post', onNewPost);
	};

	TopicList.removeListeners = function () {
		socket.removeListener('event:new_topic', onNewTopic);
		socket.removeListener('event:new_post', onNewPost);
	};

	function onNewTopic(data) {
		if (ajaxify.data.selectedCids && ajaxify.data.selectedCids.indexOf(parseInt(data.cid, 10)) === -1) {
			return;
		}

		if (ajaxify.data.selectedFilter && ajaxify.data.selectedFilter.filter === 'watched') {
			return;
		}

		if (ajaxify.data.template.category && parseInt(ajaxify.data.cid, 10) !== parseInt(data.cid, 10)) {
			return;
		}

		newTopicCount += 1;
		updateAlertText();
	}

	function onNewPost(data) {
		function showAlert() {
			newPostCount += 1;
			updateAlertText();
		}

		var post = data.posts[0];
		if (!post || !post.topic) {
			return;
		}
		if (parseInt(post.topic.mainPid, 10) === parseInt(post.pid, 10)) {
			return;
		}

		if (ajaxify.data.selectedCids && ajaxify.data.selectedCids.indexOf(parseInt(post.topic.cid, 10)) === -1) {
			return;
		}

		if (ajaxify.data.selectedFilter && ajaxify.data.selectedFilter.filter === 'new') {
			return;
		}

		if (ajaxify.data.template.category && parseInt(ajaxify.data.cid, 10) !== parseInt(post.topic.cid, 10)) {
			return;
		}

		if (ajaxify.data.selectedFilter && ajaxify.data.selectedFilter.filter === 'watched') {
			socket.emit('topics.isFollowed', post.tid, function (err, isFollowed) {
				if (err) {
					app.alertError(err.message);
				}
				if (isFollowed) {
					showAlert();
				}
			});
			return;
		}

		showAlert();
	}

	function updateAlertText() {
		var text = '';

		if (newTopicCount === 0) {
			if (newPostCount === 1) {
				text = '[[recent:there-is-a-new-post]]';
			} else if (newPostCount > 1) {
				text = '[[recent:there-are-new-posts, ' + newPostCount + ']]';
			}
		} else if (newTopicCount === 1) {
			if (newPostCount === 0) {
				text = '[[recent:there-is-a-new-topic]]';
			} else if (newPostCount === 1) {
				text = '[[recent:there-is-a-new-topic-and-a-new-post]]';
			} else if (newPostCount > 1) {
				text = '[[recent:there-is-a-new-topic-and-new-posts, ' + newPostCount + ']]';
			}
		} else if (newTopicCount > 1) {
			if (newPostCount === 0) {
				text = '[[recent:there-are-new-topics, ' + newTopicCount + ']]';
			} else if (newPostCount === 1) {
				text = '[[recent:there-are-new-topics-and-a-new-post, ' + newTopicCount + ']]';
			} else if (newPostCount > 1) {
				text = '[[recent:there-are-new-topics-and-new-posts, ' + newTopicCount + ', ' + newPostCount + ']]';
			}
		}

		text += ' [[recent:click-here-to-reload]]';

		$('#new-topics-alert').translateText(text).removeClass('hide').fadeIn('slow');
		$('#category-no-topics').addClass('hide');
	}

	TopicList.handleCategorySelection = function () {
		function getSelectedCids() {
			var cids = [];
			$('[component="category/list"] [data-cid]').each(function (index, el) {
				if ($(el).find('i.fa-check').length) {
					cids.push(parseInt($(el).attr('data-cid'), 10));
				}
			});
			cids.sort(function (a, b) {
				return a - b;
			});
			return cids;
		}

		$('[component="category/dropdown"]').on('hidden.bs.dropdown', function () {
			var cids = getSelectedCids();
			var changed = ajaxify.data.selectedCids.length !== cids.length;
			ajaxify.data.selectedCids.forEach(function (cid, index) {
				if (cid !== cids[index]) {
					changed = true;
				}
			});

			if (changed) {
				var url = window.location.pathname;
				var currentParams = utils.params();
				if (cids.length) {
					currentParams.cid = cids;
					url += '?' + decodeURIComponent($.param(currentParams));
				}
				ajaxify.go(url);
			}
		});

		$('[component="category/list"]').on('click', '[data-cid]', function (ev) {
			function selectChildren(parentCid, flag) {
				$('[component="category/list"] [data-parent-cid="' + parentCid + '"] [component="category/select/icon"]').toggleClass('fa-check', flag);
				$('[component="category/list"] [data-parent-cid="' + parentCid + '"]').each(function (index, el) {
					selectChildren($(el).attr('data-cid'), flag);
				});
			}
			var categoryEl = $(this);
			var cid = $(this).attr('data-cid');
			if (ev.ctrlKey) {
				selectChildren(cid, !categoryEl.find('[component="category/select/icon"]').hasClass('fa-check'));
			}
			categoryEl.find('[component="category/select/icon"]').toggleClass('fa-check');
			$('[component="category/list"] li').first().find('i').toggleClass('fa-check', !getSelectedCids().length);
			return false;
		});
	};


	TopicList.loadMoreTopics = function (direction) {
		if (!$('[component="category"]').length) {
			return;
		}
		var topics = $('[component="category/topic"]');
		var afterEl = direction > 0 ? topics.last() : topics.first();
		var after = (parseInt(afterEl.attr('data-index'), 10) || 0) + (direction > 0 ? 1 : 0);
		loadTopicsAfter(after, direction);
	};

	function loadTopicsAfter(after, direction, callback) {
		callback = callback || function () {};
		var query = utils.params();
		infinitescroll.loadMore('topics.loadMoreRecentTopics', {
			after: after,
			direction: direction,
			count: config.topicsPerPage,
			cid: query.cid,
			query: query,
			filter: ajaxify.data.selectedFilter.filter,
			set: $('[component="category"]').attr('data-set') ? $('[component="category"]').attr('data-set') : 'topics:recent',
		}, function (data, done) {
			if (data.topics && data.topics.length) {
				TopicList.onTopicsLoaded('recent', data.topics, false, direction, done);
			} else {
				done();
			}
			$('[component="category"]').attr('data-nextstart', data.nextStart);
			callback();
		});
	}

	TopicList.onTopicsLoaded = function (templateName, topics, showSelect, direction, callback) {
		topics = topics.filter(function (topic) {
			return $('[component="category/topic"][data-tid="' + topic.tid + '"]').length;
		});

		if (!topics.length) {
			return callback();
		}

		var after;
		var before;
		var topicsList = $('[component="category/topic"]');

		if (direction > 0 && topics.length) {
			after = topicsList.last();
		} else if (direction < 0 && topics.length) {
			before = topicsList.first();
		}

		app.parseAndTranslate(templateName, 'topics', { topics: topics, showSelect: showSelect }, function (html) {
			$('#category-no-topics').remove();

			if (after && after.length) {
				html.insertAfter(after);
			} else if (before && before.length) {
				var height = $(document).height();
				var scrollTop = $(window).scrollTop();

				html.insertBefore(before);

				$(window).scrollTop(scrollTop + ($(document).height() - height));
			} else {
				$('[component="category"]').append(html);
			}

			html.find('.timeago').timeago();
			app.createUserTooltips();
			utils.makeNumbersHumanReadable(html.find('.human-readable-number'));
			$(window).trigger('action:topics.loaded', { topics: topics });
			callback();
		});
	};



	return TopicList;
});

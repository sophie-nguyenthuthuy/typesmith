.PHONY: test serve

test:
	node --test

serve:
	python3 -m http.server 8480

# download-directory.github.io <img src="logo.svg" width="50" height="50" align="left">

> Download just a sub directory from a GitHub repo

GitHub doesn’t let you download a single folder from a repo, which might be necessary when you just need a few files from a large repository.

This tool will handle the download of all the files in a directory, in a single click, after you entered your token.

The download starts automatically when you visit pass the link to the GitHub directory as `url` parameter, like:

[**download-directory.github.io**`?url=https://github.com/mrdoob/three.js/tree/dev/build`](https://download-directory.github.io/?url=https://github.com/mrdoob/three.js/tree/dev/build)

You can also specify download filename by adding `filename` parameter, like:

[**download-directory.github.io**`?url=https://github.com/mrdoob/three.js/tree/dev/build&filename=three-js-build`](https://download-directory.github.io/?url=https://github.com/mrdoob/three.js/tree/dev/build&filename=three-js-build) to save the file as **three-js-build.zip**.

This is an alternative to the existing [GitZip](https://kinolien.github.io/gitzip/) and [DownGit](https://minhaskamal.github.io/DownGit/) but without the cruft.

## Related

- [list-github-dir-content](https://github.com/fregante/list-github-dir-content) - List all the files in a GitHub repo’s directory
- [Refined GitHub](https://github.com/refined-github/refined-github) - Browser extension that adds a link to this app to GitHub (and much more)

## License

MIT © [Federico Brigante](http://twitter.com/bfred_it)

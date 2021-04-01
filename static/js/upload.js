$(() => {
    const html = $('html');
    const filesDiv = $('#files-container');
    const dropDiv = $('#droparea');
    const nameInput = $('#nameinput');
    const waitDiv = $('#waitdiv');

    let enterTarget = null;

    html.on('dragenter', (e) => {
        enterTarget = e.target;
        e.stopPropagation();
        dropDiv.text('Drop here');
        e.preventDefault();
    });

    $(document).on('dragleave', (e) => {
        e.preventDefault();
        if (enterTarget === e.target) {
            dropDiv.text('Drag files here');
        }
    });
    dropDiv.on('dragenter', (e) => {
        enterTarget = e.target;
        dropDiv.text('Drop');
        e.stopPropagation();
        e.preventDefault();
    });

    dropDiv.on('dragover', (e) => {
        e.preventDefault();
    });

    dropDiv.on('dragleave', (e) => {
        dropDiv.text('Drop here');
    });

    dropDiv.on('drop', (e) => {
        waitDiv.css('display', 'flex');
        dropDiv.text('Drag files here');
        e.preventDefault();
        let { files } = e.originalEvent.dataTransfer;
        if (files) {
            let filesArr = [...files];
            if (filesArr.some((file) => !file.type)) {
                dropDiv.text('Directories and/or files without extension not allowed');
            } else {
                let formData = new FormData();
                filesArr.forEach((file) => formData.append('file', file));
                formData.append('albumname', nameInput.val());
                $.ajax({
                    url: '/upload',
                    method: 'POST',
                    data: formData,
                    contentType: false,
                    processData: false,
                    success(data) {
                        waitDiv.css('display', 'none');
                        filesDiv.empty();
                        data.sort();
                        addFileEntries(data);
                    },
                });
            }
        }
    });

    const EXT_IMGS = {
        '': '/img/default.svg',
        mp3: '/img/mp3.svg',
        jpg: '/img/jpg.svg',
    };

    function fileExtension(filename) {
        let index = filename.lastIndexOf('.');
        if (index > -1) {
            return filename.substring(index + 1, filename.length);
        }
        return '';
    }

    function addFileEntries(files) {
        files.forEach((file) => {
            let fileDiv = $('<div class="fileentry">');
            let ext = fileExtension(file);
            let imgUrl = EXT_IMGS[ext] || '/img/default.svg';
            let extImg = $('<img class="extimg">');
            extImg.attr('src', imgUrl);
            extImg.attr('alt', ext);

            let filenameDiv = $('<div class="filename-container">');
            filenameDiv.text(file);

            fileDiv.append(extImg, filenameDiv);
            filesDiv.append(fileDiv);
        });
    }
});

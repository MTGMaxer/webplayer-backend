$(() => {
    const html = $('html');
    const mainDiv = $('#main');
    const dropDiv = $('#droparea');
    const nameInput = $('#nameinput');

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
                        console.log(data);
                    },
                });
            }
        }
    });
});

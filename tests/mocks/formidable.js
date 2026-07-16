function formidable() {
    return {};
}

class IncomingForm {
    parse() {
        return null;
    }
}

formidable.IncomingForm = IncomingForm;
formidable.File = class { };
formidable.PersistentFile = class { };
formidable.VolatileFile = class { };

module.exports = formidable;

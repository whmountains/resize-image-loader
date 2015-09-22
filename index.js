// Options
//  @sizes Array of Integers
//    require('resize-image?sizes[]=200w,sizes[]=900w!./myImage.jpg');
//
//  @placeholder Integers (not compatible with sizes)
//    require('resize-image?placeholder=500!./myImage.jpg');
//  @blur Integers (not compatible with sizes)
//    require('resize-image?placeholder&blur=10!./myImage.jpg');
//
//  @format String ('jpg', 'gif', 'webp', 'png')
//    require('resize-image?format=webp!./myImage.jpg');


var gm = require('gm').subClass({ imageMagick: true });
var Datauri = require('datauri');
var fs = require('fs');
var loaderUtils = require('loader-utils');

var defaultSizes = ['320w','960w','2048w'];
var defaultBlur = 40;
var defaultPlaceholderSize = 20;

var queue = (function(q, c){
  var max = 10;
  var push = function(fnc){
      q.push(fnc);
      canDo();
    },
    canDo = function(){
      if(c < max && q.length > 0){
        // console.log(q.length + " images remaining.");
        c++;
        q.shift()(next);
      }
    },
    next = function(){
      setTimeout(function(){
        c--;
        canDo();
      },0);
    };
    return {push:push, next:next};
}([], 0));

function createPlaceholder(content, placeholder, ext, blur, callback, files){
  return function(next){

    var getSize = function(){
      gm(content)
        .size(function(err, _size){
          if (err) {
            // console.log('err: ', err);
            return;
          }
          if (!_size) {
            getSize();
            return;
          }
          // console.log('size: ',_size);
          setPlaceholder(_size);
      });
    };

    var setPlaceholder = function(size){
      gm(content)
        .resize(placeholder)
        .toBuffer(ext, function(err, buf){
          if (!buf) return;
          // console.log(files, size);
          var uri = new Datauri().format('.'+ext, buf).content;
          var blur =  "<svg xmlns='http://www.w3.org/2000/svg' width='100%' viewBox='0 0 " + size.width + " " + size.height + "'>" +
                        "<defs><filter id='puppybits'><feGaussianBlur in='SourceGraphic' stdDeviation='" + defaultBlur + "'/></filter></defs>" +
                        "<image width='100%' height='100%' xmlns:xlink='http://www.w3.org/1999/xlink' xlink:href='" + uri + "' filter='url(#puppybits)'></image>" +
                      "</svg>";
          var micro = new Datauri().format('.svg', new Buffer(blur, 'utf8')).content;
          callback(null, "module.exports = \""+micro+"\"");
          next();
        });
    };
  };
}

function createResponsiveImages(content, sizes, ext, files, emitFile, callback){
  return function(next){
    var count = 0;
    var images = [];
    var imgset = files.map(function(file, i){ return file + ' ' + sizes[i] + ' '; }).join(',');
    sizes.map(function(size, i){
      size = parseInt(size);
      gm(content)
        .resize(size)
        .toBuffer(ext, function(err, buf){
          if (buf){
            // console.log('output: ', files[i]);
            images[i] = buf;
            emitFile(files[i], buf);
          }

          count++;
          if (count >= files.length) {
            callback(null, "module.exports = \""+imgset+"\"");
            next();
          }
      });
    });
  };
}

module.exports = function(content) {
  var idx = this.loaderIndex;

  // ignore content from previous loader because it could be datauri
  content = fs.readFileSync(this.resourcePath);

  var query = (this.query !== '' ? this.query : this.loaders[0].query);
  query = loaderUtils.parseQuery(query);

  query.sizes = (query.sizes && !Array.isArray(query.sizes) && [query.sizes]) || query.sizes || defaultSizes;

  var callback = this.async();
  if(!this.emitFile) throw new Error("emitFile is required from module system");
  this.cacheable && this.cacheable();
  this.addDependency(this.resourcePath);

  if (this.debug === true && query.bypassOnDebug === true) {
    // Bypass processing while on watch mode
    return callback(null, content);
  } else {

    var paths = this.resourcePath.split('/');
    var file = paths[paths.length - 1];
    var name = file.slice(0,file.lastIndexOf('.'));
    var ext = file.slice(file.lastIndexOf('.')+1, file.length);
    var sizes = query.sizes.map(function(s){ return s; });
    var files = sizes.map(function(size, i){ return name + '-' + size + '.' + ext; });

    if (query.placeholder) {
      query.placeholder = parseInt(query.placeholder) || defaultPlaceholderSize;
      query.blur = query.blur || defaultBlur;

      queue.push(createPlaceholder(content, query.placeholder, ext, query.blur, callback, files));
    } else /* return srcset*/ {

      var emitFile = this.emitFile;
      queue.push(createResponsiveImages(content, sizes, ext, files, emitFile, callback));
    }
  }
};

module.exports.raw = true; // get buffer stream instead of utf8 string

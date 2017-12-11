module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        sass: {
            dist: {
                options: {
                    style: 'expanded'
                },
                files: {
                    'style/mainStyle.css' : '_sass/mainStyle.scss',
                    'style/welcome.css'   : '_sass/welcome.scss',
                    'style/dashboard.css' : '_sass/dashboard.scss',
                    'style/vis.css'       : '_sass/vis.scss'
                }
            }
        },
        watch: {
            style: {
                files: '_sass/**/*.scss',
                tasks: ['sass']
            }
        },
        run: {
            test: {
                cmd: 'node',
                args: [
                    'script/GitPipe/TestGP.js'
                ]
            }
        }
        
    });
    
    // Loading plugins
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-sass')
    grunt.loadNpmTasks('grunt-run');

    // Registering tasks
    grunt.registerTask('default', ['run:test', 'sass']);
    grunt.registerTask('test', ['run:test'])
};
